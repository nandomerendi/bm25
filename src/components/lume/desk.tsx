import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Compass, Copy, MessageSquareText, PenLine, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { Inspector, type InspectTurn } from "@/components/lume/inspector";
import { lumeUrl } from "@/lib/lume/client";
import type { ModeReport } from "@/lib/lume/eval";
import { SCENARIOS } from "@/lib/lume/scenarios";
import { SCREEN_POP } from "@/lib/lume/knowledge";
import {
  APPROACH_LABEL,
  DEFAULT_THRESHOLDS,
  INTENT_LABEL,
  JOURNEY_LABEL,
  KIND_LABEL,
  SENTIMENT_LABEL,
  TOPIC_LABEL,
  type Approach,
  type Card,
  type InteractionState,
  type Posture,
  type Role,
  type Thresholds,
  type TurnResult,
} from "@/lib/lume/types";

interface LogItem extends InspectTurn {
  id: string;
}

type Panel = "conversa" | "copiloto" | "inspecao";

const KIND_ICON = {
  knowledge: BookOpen,
  reply: MessageSquareText,
  guidance: Compass,
  alert: ShieldAlert,
} as const;

export function Desk() {
  const [panel, setPanel] = useState<Panel>("conversa");
  const [approach, setApproach] = useState<Approach>("C");
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]?.id ?? "saudacao");
  const [cursor, setCursor] = useState(0);
  const [role, setRole] = useState<Role>("customer");
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rewritten, setRewritten] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, "util" | "dispensada">>({});
  const [counts, setCounts] = useState({ util: 0, dispensada: 0, copiada: 0, modelo: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ModeReport[] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const state: InteractionState | null = log.length ? log[log.length - 1]!.result.state : null;
  const active = log.find((item) => item.id === selected) ?? log[log.length - 1] ?? null;
  const lastCustomer = [...log].reverse().find((item) => item.role === "customer" && !item.consult);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log.length, busy]);

  useEffect(() => {
    let gone = false;
    fetch(lumeUrl())
      .then((response) => response.json())
      .then((body: { model?: boolean }) => {
        if (!gone) setModel(Boolean(body.model));
      })
      .catch(() => {
        if (!gone) setModel(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  const chips = useMemo(() => {
    if (!state || state.turn === 0) return [];
    return [
      state.topic ? TOPIC_LABEL[state.topic] : "Assunto aberto",
      state.intent ? INTENT_LABEL[state.intent] : "Sem intenção",
      JOURNEY_LABEL[state.journey],
      SENTIMENT_LABEL[state.sentiment.label],
    ];
  }, [state]);

  function reset(nextScenario = scenarioId) {
    seq.current += 1;
    setScenarioId(nextScenario);
    setCursor(0);
    setLog([]);
    setSelected(null);
    setEdits({});
    setRewritten({});
    setFeedback({});
    setError(null);
    setDraft("");
  }

  async function deliver(input: { text: string; role: Role; posture?: Posture; consult?: boolean }) {
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const response = await fetch(lumeUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "turn",
          text: input.text,
          role: input.role,
          posture: input.posture ?? "proactive",
          approach,
          state,
          thresholds,
        }),
      });
      const body = (await response.json()) as TurnResult & { error?: string };
      if (!response.ok || body.error) throw new Error(body.error ?? "A mesa não respondeu.");
      if (mine !== seq.current) return;
      const item: LogItem = {
        id: `${mine}`,
        role: input.role,
        text: input.text,
        consult: input.consult,
        result: body,
        clientMs: performance.now() - started,
      };
      setLog((current) => [...current, item]);
      setSelected(item.id);
      if (body.cards.length) setPanel("copiloto");
    } catch (cause) {
      if (mine === seq.current) setError(cause instanceof Error ? cause.message : "Falha ao ler a fala.");
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }

  async function sendDraft() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await deliver({ text, role });
  }

  async function nextLine() {
    const turn = scenario?.turns[cursor];
    if (!turn || busy) return;
    setCursor((value) => value + 1);
    setRole(turn.role);
    await deliver({ text: turn.text, role: turn.role });
  }

  async function askBase() {
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    await deliver({ text, role: "operator", posture: "reactive", consult: true });
  }

  async function rewrite(card: Card, customerText: string) {
    const draftReply = edits[card.id] ?? card.reply ?? "";
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(lumeUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "compose",
          customerText,
          draft: draftReply,
          sources: card.sources.map((source) => ({ title: source.title, excerpt: source.excerpt })),
        }),
      });
      const body = (await response.json()) as { ok?: boolean; reply?: string; error?: string };
      if (!body.ok || !body.reply) throw new Error(body.error ?? "Sem reescrita.");
      setEdits((current) => ({ ...current, [card.id]: body.reply! }));
      setRewritten((current) => ({ ...current, [card.id]: true }));
      setCounts((current) => ({ ...current, modelo: current.modelo + 1 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A reescrita falhou.");
    } finally {
      setBusy(false);
    }
  }

  async function runEval() {
    setEvaluating(true);
    setEvalError(null);
    try {
      const response = await fetch(lumeUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "eval" }),
      });
      const body = (await response.json()) as { reports?: ModeReport[]; error?: string };
      if (!response.ok || !body.reports) throw new Error(body.error ?? "A avaliação falhou.");
      setReports(body.reports);
    } catch (cause) {
      setEvalError(cause instanceof Error ? cause.message : "A avaliação falhou.");
    } finally {
      setEvaluating(false);
    }
  }

  function useReply(text: string) {
    setRole("operator");
    setDraft(text);
    setCounts((current) => ({ ...current, copiada: current.copiada + 1 }));
    setPanel("conversa");
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  const cards = active?.result.cards ?? [];
  const visibleCards = cards.filter((card) => feedback[card.id] !== "dispensada");

  return (
    <main className="flex h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative h-10 w-3 rounded-full bg-pine" aria-hidden="true">
              <span className="absolute right-0 bottom-1 h-3 w-3 rounded-full bg-rust" />
            </span>
            <div>
              <h1 className="font-display text-3xl leading-none italic">LUME</h1>
              <p className="mt-1 text-sm text-muted">Copiloto de mesa · entra na hora e cala no resto</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Abordagem">
            {(["C", "B", "A"] as Approach[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setApproach(item)}
                className={`h-11 rounded-full px-3 text-sm ${approach === item ? "bg-ink text-surface" : "bg-surface text-ink"}`}
              >
                {APPROACH_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm text-pretty text-muted">
          {SCREEN_POP.name} · {SCREEN_POP.id} · {SCREEN_POP.productName} · {SCREEN_POP.tenureMonths} meses · sem atraso · screen pop
          sintético. Nada é enviado ao cliente.
        </p>
      </header>

      <div className="flex gap-2 border-b border-line px-4 py-2 lg:hidden">
        {(
          [
            ["conversa", "Conversa"],
            ["copiloto", "Copiloto"],
            ["inspecao", "Inspeção"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className={`h-11 flex-1 rounded-full text-sm ${panel === id ? "bg-pine text-surface" : "bg-chip text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(18rem,0.9fr)]">
        <section className={`${panel === "conversa" ? "flex" : "hidden lg:flex"} h-full min-h-0 flex-col overflow-hidden border-line lg:border-r`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <label className="sr-only" htmlFor="scenario">
              Cenário
            </label>
            <select
              id="scenario"
              className="h-11 max-w-full rounded-full border border-line bg-surface px-3 text-sm"
              value={scenarioId}
              onChange={(event) => reset(event.target.value)}
            >
              {SCENARIOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void nextLine()} disabled={!scenario || cursor >= scenario.turns.length || busy} className="h-11 rounded-full bg-pine px-4 text-sm text-surface disabled:opacity-50">
              Próxima fala
            </button>
            <button type="button" onClick={() => reset()} className="flex h-11 items-center gap-2 rounded-full bg-chip px-3 text-sm">
              <RotateCcw className="size-4" aria-hidden="true" />
              Limpar
            </button>
          </div>
          <p className="px-4 pt-3 text-sm text-pretty text-muted">{scenario?.blurb}</p>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {log.length === 0 && <p className="text-sm text-muted">Escolha um cenário e avance fala a fala, ou escreva você mesmo.</p>}
            {log.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className={`max-w-[36rem] rounded-2xl px-3 py-3 text-left ${item.role === "customer" ? "self-start bg-ink text-surface" : "self-end border border-line bg-surface text-ink"} ${selected === item.id ? "ring-2 ring-pine" : ""}`}
              >
                <span className={`block text-xs ${item.role === "customer" ? "text-chip" : "text-muted"}`}>
                  {item.consult ? "Consulta à base · não vai ao cliente" : item.role === "customer" ? "Cliente" : "Operador"}
                </span>
                <span className="mt-1 block text-sm text-pretty">{item.text}</span>
              </button>
            ))}
            {busy && <p className="text-sm text-muted">Lendo a fala…</p>}
            <div ref={endRef} />
          </div>
          <form
            className="flex flex-col gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendDraft();
            }}
          >
            {error && <p className="text-sm text-rust">{error}</p>}
            <div className="flex gap-2">
              {(["customer", "operator"] as Role[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRole(item)}
                  className={`h-11 rounded-full px-3 text-sm ${role === item ? "bg-ink text-surface" : "bg-chip"}`}
                >
                  {item === "customer" ? "Cliente" : "Operador"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                placeholder="Escreva a fala. Nada dispara sozinho."
                className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pine"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="flex h-11 items-center gap-2 self-end rounded-full bg-ink px-4 text-sm text-surface disabled:opacity-50" aria-label="Enviar fala">
                <Send className="size-4" aria-hidden="true" />
                Enviar
              </button>
            </div>
          </form>
        </section>

        <section className={`${panel === "copiloto" ? "flex" : "hidden lg:flex"} h-full min-h-0 flex-col overflow-hidden border-line lg:border-r`} aria-live="polite">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-display text-2xl leading-none">Neste momento</h2>
              <p className="mt-1 text-sm text-muted">{state ? `Fala ${state.turn} · ${state.sentiment.trend}` : "Em escuta"}</p>
            </div>
            <Spark values={state?.sentiment.history ?? []} negative={(state?.sentiment.score ?? 0) < -0.1} />
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li key={chip} className="rounded-full bg-chip px-3 py-2 text-sm">
                    {chip}
                  </li>
                ))}
              </ul>
            )}
            {!active && (
              <p className="max-w-md text-sm text-pretty text-muted">
                LUME está em escuta. Cumprimento, repetição e assunto já coberto ficam em silêncio — e o motivo aparece aqui, sem card.
              </p>
            )}
            {active?.result.silence && (
              <p className="lume-in rounded-2xl border border-dashed border-line px-3 py-3 text-sm text-pretty text-muted">
                Silêncio · {active.result.silence.ruleId} · {active.result.silence.reason}
              </p>
            )}
            {visibleCards.map((card) => {
              const Icon = KIND_ICON[card.kind];
              const reply = edits[card.id] ?? card.reply;
              return (
                <article
                  key={card.id}
                  className={`lume-in rounded-2xl border border-line p-3 ${card.kind === "alert" ? "border-rust bg-rust-soft" : "bg-surface"}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4" aria-hidden="true" />
                    <p className="text-xs tracking-wide text-muted uppercase">
                      Nível {card.level} · {KIND_LABEL[card.kind]}
                    </p>
                  </div>
                  <h3 className="mt-2 font-display text-xl leading-tight">{card.title}</h3>
                  <p className="mt-2 text-sm text-pretty">{card.body}</p>
                  {reply && (
                    <textarea
                      value={reply}
                      maxLength={300}
                      onChange={(event) => setEdits((current) => ({ ...current, [card.id]: event.target.value }))}
                      className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pine"
                    />
                  )}
                  {reply && <p className="mt-1 text-right text-xs tabular-nums text-muted">{reply.length}/300</p>}
                  {rewritten[card.id] && <p className="text-xs text-pine">Reescrito pelo modelo. Revise antes de usar.</p>}
                  {card.sources.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {card.sources.map((source) => (
                        <li key={source.docId} className="rounded-2xl bg-chip px-3 py-2 text-sm">
                          <span className="font-medium">{source.title}</span>
                          <span className="text-muted"> · {source.section}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-pretty text-muted">{card.why}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reply && (
                      <button type="button" onClick={() => useReply(reply)} className="flex h-11 items-center gap-2 rounded-full bg-pine px-3 text-sm text-surface">
                        <Copy className="size-4" aria-hidden="true" />
                        Usar no rascunho
                      </button>
                    )}
                    {card.kind === "reply" && (
                      <button
                        type="button"
                        disabled={busy || model === false}
                        onClick={() => void rewrite(card, lastCustomer?.text ?? active?.text ?? "")}
                        className="flex h-11 items-center gap-2 rounded-full bg-chip px-3 text-sm disabled:opacity-50"
                      >
                        <PenLine className="size-4" aria-hidden="true" />
                        Fundamentar com modelo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setFeedback((current) => ({ ...current, [card.id]: "util" }));
                        setCounts((current) => ({ ...current, util: current.util + 1 }));
                      }}
                      className="flex h-11 items-center gap-2 rounded-full bg-chip px-3 text-sm"
                    >
                      <Check className="size-4" aria-hidden="true" />
                      Útil
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFeedback((current) => ({ ...current, [card.id]: "dispensada" }));
                        setCounts((current) => ({ ...current, dispensada: current.dispensada + 1 }));
                      }}
                      className="h-11 rounded-full bg-chip px-3 text-sm"
                    >
                      Dispensar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void askBase();
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Perguntar à base, sem mandar ao cliente"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-pine"
            />
            <button type="submit" disabled={busy || !question.trim()} className="h-11 rounded-full bg-ink px-4 text-sm text-surface disabled:opacity-50">
              Perguntar
            </button>
          </form>
        </section>

        <div className={`${panel === "inspecao" ? "flex" : "hidden lg:flex"} h-full min-h-0 flex-col overflow-hidden`}>
          <Inspector
            turn={active}
            reports={reports}
            evaluating={evaluating}
            evalError={evalError}
            onEvaluate={() => void runEval()}
            thresholds={thresholds}
            onThresholds={setThresholds}
            model={model}
            feedback={counts}
          />
        </div>
      </div>
    </main>
  );
}

function Spark({ values, negative }: { values: number[]; negative: boolean }) {
  if (values.length < 2) return <span className="text-xs text-muted">sem tendência</span>;
  const w = 96;
  const h = 28;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = h / 2 - value * (h / 2 - 3);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-8 w-24 ${negative ? "text-rust" : "text-pine"}`} role="img" aria-label="Tendência do sentimento">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}
