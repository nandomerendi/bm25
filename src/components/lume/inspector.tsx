import { useState } from "react";
import type { ModeReport } from "@/lib/lume/eval";
import {
  APPROACH_LABEL,
  INTENT_LABEL,
  JOURNEY_LABEL,
  SENTIMENT_LABEL,
  TOPIC_LABEL,
  type Thresholds,
  type TurnResult,
} from "@/lib/lume/types";

export interface InspectTurn {
  role: "customer" | "operator";
  text: string;
  result: TurnResult;
  clientMs: number;
  consult?: boolean;
}

const TABS = ["Agora", "Tempo", "Fontes", "Trilha", "Avaliação", "Tese"] as const;
type Tab = (typeof TABS)[number];

export function Inspector({
  turn,
  reports,
  evaluating,
  evalError,
  onEvaluate,
  thresholds,
  onThresholds,
  model,
  feedback,
}: {
  turn: InspectTurn | null;
  reports: ModeReport[] | null;
  evaluating: boolean;
  evalError: string | null;
  onEvaluate: () => void;
  thresholds: Thresholds;
  onThresholds: (next: Thresholds) => void;
  model: boolean | null;
  feedback: { util: number; dispensada: number; copiada: number; modelo: number };
}) {
  const [tab, setTab] = useState<Tab>("Agora");
  const result = turn?.result;

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-11 rounded-full px-3 text-sm ${tab === item ? "bg-ink text-surface" : "bg-chip text-ink"}`}
          >
            {item}
          </button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "Agora" && <Now turn={turn} />}
        {tab === "Tempo" && result && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted">
              O relógio da mesa mede da saída do pedido até o card pintado. O motor mede só o cálculo. Nada aqui é latência inventada.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Até a tela" value={`${turn?.clientMs.toFixed(0)} ms`} />
              <Stat label="Motor" value={`${result.totalMs.toFixed(2)} ms`} />
              <Stat label="Payload" value={`${result.payloadBytes} B`} />
              <Stat label="Chamadas reais" value={String(result.llmCalls)} />
            </div>
            <ol className="flex flex-col gap-2">
              {result.timings.map((stage) => (
                <li key={stage.stage} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-sm">
                  <span>{stage.stage}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-chip">
                    <span className="block h-2 rounded-full bg-pine" style={{ width: `${Math.min(100, stage.ms * 12)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted">{stage.ms.toFixed(2)}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">
              Política de modelo nesta fala: {result.tokens.policyLlmCalls} chamada estimada, cerca de {result.tokens.promptTokens} tokens de
              prompt. {result.tokens.note}
            </p>
          </div>
        )}
        {tab === "Fontes" && result && (
          <div className="flex flex-col gap-4">
            {!result.retrieval && <p className="text-sm text-muted">Esta fala não consultou a base. O portão segurou a busca.</p>}
            {result.retrieval && (
              <>
                <p className="text-sm text-muted">
                  Estratégia {result.retrieval.strategy}. A coluna lexical é BM25 cru da fala. A híbrida soma expansão da ontologia, título e
                  etiqueta. {result.retrieval.rejected ? "Nenhum trecho passou do limiar." : "Trechos usados abaixo."}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Rank title="Lexical" rows={result.retrieval.lexicalTop.map((item) => `${item.title} · ${item.score}`)} />
                  <Rank title="Híbrido" rows={result.retrieval.hybridTop.map((item) => `${item.title} · ${item.score}`)} />
                </div>
                <ul className="flex flex-col gap-3">
                  {result.cards.flatMap((card) => card.sources).map((source) => (
                    <li key={`${source.docId}-${source.score}`} className="rounded-2xl border border-line bg-surface p-3">
                      <p className="text-sm font-medium">{source.title}</p>
                      <p className="text-xs text-muted">{source.section} · {source.docId}</p>
                      <p className="mt-2 text-sm text-pretty">{source.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {tab === "Trilha" && result && (
          <div className="flex flex-col gap-4 text-sm">
            <Block title="Observado" items={result.audit.observed} />
            <Block title="Inferido" items={result.audit.inferred} />
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-xs tracking-wide text-muted uppercase">Decisão · {result.audit.ruleId}</p>
              <p className="mt-2 text-pretty">{result.audit.decision}</p>
            </div>
            <p className="text-muted">
              Tier usado: {result.effectiveTier ?? "nenhum"} · origem {result.tierSource}. Screen pop não é consulta a core bancário.
            </p>
          </div>
        )}
        {tab === "Avaliação" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted">
              O gabarito descreve a política deste protótipo, não um conjunto cego de produção. A, B e as ablações correm sobre as mesmas
              falas. Não há vencedor fora dessa pergunta.
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-chip px-3 py-2">úteis {feedback.util}</span>
              <span className="rounded-full bg-chip px-3 py-2">dispensados {feedback.dispensada}</span>
              <span className="rounded-full bg-chip px-3 py-2">copiados {feedback.copiada}</span>
              <span className="rounded-full bg-chip px-3 py-2">reescritos {feedback.modelo}</span>
            </div>
            <button
              type="button"
              onClick={onEvaluate}
              disabled={evaluating}
              className="h-11 rounded-full bg-pine px-4 text-sm text-surface disabled:opacity-60"
            >
              {evaluating ? "Medindo…" : "Rodar os 18 cenários"}
            </button>
            {evalError && <p className="text-sm text-rust">{evalError}</p>}
            {reports && <ReportTable reports={reports} />}
            <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
              <legend className="px-1 text-sm">Limiares da próxima fala</legend>
              <Slider label="Confiança mínima" min={0.3} max={0.8} step={0.02} value={thresholds.minConfidence} onChange={(minConfidence) => onThresholds({ ...thresholds, minConfidence })} />
              <Slider label="Cooldown (falas)" min={0} max={6} step={1} value={thresholds.cooldownTurns} onChange={(cooldownTurns) => onThresholds({ ...thresholds, cooldownTurns })} />
              <Slider label="Piso da busca" min={0} max={12} step={0.2} value={thresholds.minRetrieval} onChange={(minRetrieval) => onThresholds({ ...thresholds, minRetrieval })} />
            </fieldset>
            <p className="text-sm text-muted">Modelo para reescrita manual: {model === null ? "…" : model ? "disponível" : "não configurado"}.</p>
          </div>
        )}
        {tab === "Tese" && <Thesis />}
        {tab !== "Tese" && tab !== "Avaliação" && tab !== "Agora" && !result && (
          <p className="text-sm text-muted">Envie uma fala para inspecionar sinal, tempo e trilha.</p>
        )}
      </div>
    </section>
  );
}

function Now({ turn }: { turn: InspectTurn | null }) {
  if (!turn) return <p className="text-sm text-muted">A mesa ainda não ouviu ninguém.</p>;
  const { signals, state, approach } = turn.result;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-pretty text-muted">
        {APPROACH_LABEL[approach]} · a API recebeu estado + esta fala, não o transcript. {turn.result.payloadBytes} bytes.
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <Pair k="Assunto" v={`${TOPIC_LABEL[signals.topic.id]} · ${signals.topic.confidence.toFixed(2)}`} />
        <Pair k="Intenção" v={`${INTENT_LABEL[signals.intent.id]} · ${signals.intent.confidence.toFixed(2)}`} />
        <Pair k="Sentimento" v={`${SENTIMENT_LABEL[signals.sentiment.label]} · ${signals.sentiment.score.toFixed(2)}`} />
        <Pair k="Jornada" v={JOURNEY_LABEL[state.journey]} />
        <Pair k="Tendência" v={state.sentiment.trend} />
        <Pair k="Resolução" v={state.resolution} />
      </dl>
      <p className="text-pretty">
        Evidência lexical: {signals.topic.evidence.concat(signals.intent.evidence).join(", ") || "nenhuma"}.
      </p>
      {signals.risks.length > 0 && (
        <p>Riscos: {signals.risks.map((risk) => `${risk.id} ${risk.confidence.toFixed(2)}`).join(" · ")}</p>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function Rank({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs tracking-wide text-muted uppercase">{title}</p>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ol>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted uppercase">{title}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-surface px-3 py-2 text-pretty">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-muted">{value}</span>
      </span>
      <input
        className="h-11 accent-pine"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ReportTable({ reports }: { reports: ModeReport[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead className="bg-chip text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Modo</th>
            <th className="px-3 py-2 font-medium">Precisão</th>
            <th className="px-3 py-2 font-medium">Cobertura</th>
            <th className="px-3 py-2 font-medium">Ruído</th>
            <th className="px-3 py-2 font-medium">LLM pol.</th>
            <th className="px-3 py-2 font-medium">p50</th>
            <th className="px-3 py-2 font-medium">p95</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-t border-line bg-surface">
              <td className="px-3 py-2">{report.label}</td>
              <td className="px-3 py-2 tabular-nums">{report.precision.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums">{report.recall.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums">{report.unnecessaryRate.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums">{report.policyLlmCalls}</td>
              <td className="px-3 py-2 tabular-nums">{report.latency.p50.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums">{report.latency.p95.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Thesis() {
  return (
    <article className="flex flex-col gap-4 text-sm text-pretty">
      <p>
        LUME separa o que os fornecedores já publicam — um portão antes da geração — do que ninguém documenta por dentro. O cérebro é um só.
        Proativo e reativo mudam a postura, não a ontologia, a base, os guardrails nem o contrato do card.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead className="bg-chip text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-3 py-2 font-medium"> </th>
              <th className="px-3 py-2 font-medium">Documentado</th>
              <th className="px-3 py-2 font-medium">Não está na doc</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.name} className="border-t border-line bg-surface align-top">
                <th className="px-3 py-3 font-medium">{row.name}</th>
                <td className="px-3 py-3">{row.known}</td>
                <td className="px-3 py-3 text-muted">{row.unknown}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="font-display text-xl">O que ficou de pé</h2>
      <p>
        A hipótese event-driven se sustenta no que é público: Google deixa escolher o evento que dispara a sugestão e tira a geração lenta do
        síncrono via Pub/Sub; Genesys tem um interruptor “detect knowledge questions” para não sugerir à toa; Amazon separa regras de
        Contact Lens (palavra, sentimento, alerta) da recomendação do Q, que mostra intenções clicáveis e só então gera a solução com citação;
        NICE RTIG dispara em frase dita ou omitida; Salesforce distingue plano dinâmico, que acompanha o caso, de plano guiado, que não é
        proativo.
      </p>
      <p>
        Descartei chamar modelo em toda fala: custa latência e produz o ruído que esses controles existem para cortar. Descartei um agente por
        skill: a ontologia cabe num portão. Descartei embedding no caminho quente: com dezenas de trechos, BM25 mais etiqueta é inspecionável.
        Embedding fica para quando a base sair do protótipo. Descartei POMDP: o estado que o operador precisa ver é curto e incremental.
      </p>
      <h2 className="font-display text-xl">Onde LUME aperta</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>Silêncio é regra nomeada, não ausência de log.</li>
        <li>Busca só depois do portão. Modelo só se o operador pedir reescrita — zero chamadas no automático.</li>
        <li>Template quando a política já tem o número. O modelo não é pré-requisito de um card útil.</li>
        <li>Dedup, cooldown e cobertura do operador. Faceta nova (“e se”) reabre.</li>
        <li>Observado e inferido ficam em colunas diferentes. Screen pop sintético não se disfarça de API.</li>
      </ul>
      <h2 className="font-display text-xl">Como evolui sem trocar o cérebro</h2>
      <p>
        O contrato já é um turno: fala, estado, abordagem, postura, cards. Num AgentCore isso vira sessão mais quatro eventos — sinais,
        oportunidade, recuperação, card — com o mesmo guardrail. Voz entra como mais um gatilho, no espírito do end-of-utterance do Google, sem
        novo agente. Dado do cliente substitui o screen pop por uma ferramenta que só o motor de oportunidade pode pedir. MCP fica atrás do
        mesmo portão, com confirmação humana. Canal nenhum envia texto sozinho.
      </p>
      <ul className="flex flex-col gap-1 text-pine">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a className="underline decoration-line underline-offset-2" href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

const ROWS = [
  {
    name: "Google PGKA",
    known: "Segue a conversa, sugere query e resposta com trechos. Gatilho configurável: fala do cliente, do agente ou fim de enunciado. Contexto vira pares chave-valor. Pode devolver a geração pesada em Pub/Sub para não segurar a API. Sem resposta, não sugere, salvo flag.",
    unknown: "Como rankeia, qual modelo, quando decide calar além do ‘sem documento’.",
  },
  {
    name: "Genesys",
    known: "Intenção ou gatilho puxa artigo, resposta pronta ou script. ‘Detect knowledge questions’ reduz sugestão irrelevante. Dá para filtrar artigo por intenção ativa e atributo. Modos: artigo, highlight ou resposta gerada.",
    unknown: "Política interna de cooldown e o texto exato mostrado depois da interação — a comunidade registra que o histórico da sugestão não está exposto.",
  },
  {
    name: "NICE",
    known: "RTIG escuta frase dita ou omitida e comportamentos de satisfação ou venda, com painel de nota. O material de Enlighten Copilot descreve sentimento, próximo passo, compliance e upsell em tempo real. Isso mistura documentação de produto e página comercial.",
    unknown: "O limiar que separa guia de frase de geração. Não tratei o blog como especificação de arquitetura.",
  },
  {
    name: "Amazon Connect",
    known: "Regras de análise conversacional disparam em palavra, sentimento e atributo, em tempo real ou depois. O assistente mostra intenções clicáveis; a solução, com citação, nasce quando o agente escolhe. Há também pergunta manual. Contact Lens é exigido para voz, não para chat.",
    unknown: "Como a intenção proativa é detectada. A doc de uso não descreve dispensa nem latência.",
  },
  {
    name: "Salesforce",
    known: "Service Assistant é proativo no caso, mensagem e voz: plano ancorado em registro, conhecimento e ações, atualizado quando o registro muda. Plano guiado não é proativo — o reps pede no chat. Ação pode ser botão manual.",
    unknown: "Custo por replanejamento e a heurística que evita reescrever o plano a cada frase.",
  },
];

const LINKS = [
  { label: "Proactive generative knowledge assist", href: "https://docs.cloud.google.com/gemini-enterprise-cx/agent-assist/pgka" },
  { label: "Best practices PGKA", href: "https://docs.cloud.google.com/gemini-enterprise-cx/agent-assist/pgka-bp" },
  { label: "Genesys Agent Copilot settings", href: "https://help.genesys.cloud/articles/configure-the-genesys-agent-copilot-settings/" },
  { label: "Work with Genesys Agent Copilot", href: "https://help.genesys.cloud/articles/work-with-genesys-agent-copilot/" },
  { label: "NICE Real-Time Interaction Guidance", href: "https://help.nicecxone.com/content/agent/cxoneagent/realtimeinteractionguidancecxa.htm" },
  { label: "Amazon Connect real-time recommendations", href: "https://docs.aws.amazon.com/connect/latest/adminguide/use-realtime-recommendations.html" },
  { label: "Contact Lens conversational rules", href: "https://docs.aws.amazon.com/connect/latest/adminguide/build-rules-for-contact-lens.html" },
  { label: "Salesforce Service Assistant", href: "https://help.salesforce.com/s/articleView?id=service.sp_intro.htm&language=en&type=5" },
];
