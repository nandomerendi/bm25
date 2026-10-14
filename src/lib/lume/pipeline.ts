import { materialize, promptSize } from "./compose.ts";
import { SCREEN_POP } from "./knowledge.ts";
import { decide } from "./opportunity.ts";
import { retrieve } from "./retrieve.ts";
import { detectSignals } from "./signals.ts";
import { emptyState, reduceState } from "./state.ts";
import { estimateTokens } from "./text.ts";
import {
  DEFAULT_THRESHOLDS,
  type Approach,
  type Card,
  type InteractionState,
  type RetrievalDebug,
  type Silence,
  type Tier,
  type TurnInput,
  type TurnResult,
} from "./types.ts";

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

const CARD_TOPICS = new Set(["anuidade", "isencao", "cancelamento", "fraude", "fatura", "limite", "cashback", "viagem"]);

export function runTurn(input: TurnInput): TurnResult {
  const started = performance.now();
  const timings: { stage: string; ms: number }[] = [];
  let last = started;
  const mark = (stage: string) => {
    const now = performance.now();
    timings.push({ stage, ms: round(now - last) });
    last = now;
  };

  const text = input.text.slice(0, 2000);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const prior = input.stateless ? emptyState() : (input.state ?? emptyState());
  const payloadBytes = new TextEncoder().encode(JSON.stringify({ text, role: input.role, state: prior })).length;
  mark("normalizar");

  const signals = detectSignals(text, input.role);
  mark("sinais");

  const state = reduceState(prior, { role: input.role, text, signals });
  mark("estado");

  const decision = decide({
    role: input.role,
    signals,
    state,
    approach: input.approach,
    posture: input.posture,
    thresholds,
    suppression: input.suppression !== false && !input.stateless,
  });
  mark("oportunidade");

  const hints = decision.hints;
  const retrieved = decision.retrieve ? retrieve(text, hints, thresholds.minRetrieval) : null;
  mark("recuperacao");

  const utteranceTier = signals.tier;
  const topicForPop = decision.topic;
  const usesPop = !utteranceTier && topicForPop !== null && CARD_TOPICS.has(topicForPop);
  const tier: Tier | null = utteranceTier ?? (usesPop ? SCREEN_POP.tier : state.tier);
  const tierSource = utteranceTier ? "fala" : usesPop || (tier === SCREEN_POP.tier && topicForPop) ? "screen-pop-sintetico" : "nenhum";

  const built = materialize({
    decision,
    docs: retrieved?.docs ?? [],
    sources: retrieved?.sources ?? [],
    signals,
    tier,
    turn: state.turn,
    maxCards: thresholds.maxCards,
    retrievalRejected: retrieved ? retrieved.debug.rejected : decision.retrieve,
  });
  mark("materializar");

  const cards: Card[] = built.cards;
  const next: InteractionState = {
    ...state,
    tier: tier ?? state.tier,
    interventions: [
      ...state.interventions,
      ...cards.map((item) => ({ signature: item.signature, kind: item.kind, turn: state.turn })),
    ].slice(-20),
  };

  const silence: Silence | null = cards.length
    ? null
    : {
        reason: built.silenceReason ?? decision.silenceReason ?? "Sem valor suficiente para interromper.",
        ruleId: built.ruleId ?? decision.ruleId,
      };

  const observed = [
    ...signals.topic.evidence.map((item) => `termo: ${item}`),
    ...signals.intent.evidence.map((item) => `termo de intenção: ${item}`),
    ...signals.sentiment.evidence.map((item) => `termo de sentimento: ${item}`),
    ...signals.risks.flatMap((risk) => risk.evidence.map((item) => `risco observado (${risk.id}): ${item}`)),
  ];
  if (tierSource === "screen-pop-sintetico") {
    observed.push(`screen pop sintético: ${SCREEN_POP.name}, ${SCREEN_POP.productName}, ${SCREEN_POP.tenureMonths} meses, sem atraso`);
  }
  if (signals.phatic) observed.push("fala inteira é saudação");
  if (signals.ack) observed.push("fala inteira é reconhecimento curto");
  if (signals.facet) observed.push("marcador de faceta nova (e se / mas / não chegar)");

  const inferred = [
    `intenção ${signals.intent.id} (${signals.intent.confidence.toFixed(2)})`,
    `assunto ${signals.topic.id} (${signals.topic.confidence.toFixed(2)})`,
    `sentimento ${signals.sentiment.label} (${signals.sentiment.score.toFixed(2)})`,
    `jornada ${next.journey}`,
  ];
  if (decision.topic && decision.topic !== signals.topic.id) {
    inferred.push(`assunto herdado do estado: ${decision.topic}`);
  }

  const policyCalls =
    input.posture === "reactive"
      ? 1
      : input.approach === "A"
        ? 1
        : cards.some((item) => item.kind === "reply" && item.generation === "template")
          ? 1
          : 0;

  const retrieval: RetrievalDebug | null = retrieved?.debug ?? null;

  return {
    state: next,
    signals,
    cards,
    silence,
    audit: {
      observed: observed.length ? observed : ["nenhum termo de ontologia na fala"],
      inferred,
      decision: cards.length ? cards.map((item) => `${item.ruleId}: ${item.why}`).join(" ") : (silence?.reason ?? decision.why),
      ruleId: cards[0]?.ruleId ?? silence?.ruleId ?? decision.ruleId,
    },
    timings,
    totalMs: round(performance.now() - started),
    llmCalls: 0,
    tokens: {
      policyLlmCalls: policyCalls,
      promptTokens: policyCalls ? promptSize(text, retrieved?.sources ?? []) : estimateTokens(text),
      note: "Chamadas de modelo não saem no caminho automático. policyLlmCalls é o que a postura gastaria se a resposta fosse gerada; llmCalls conta só chamada real.",
    },
    approach: input.approach,
    posture: input.posture,
    retrieval,
    effectiveTier: tier,
    tierSource,
    payloadBytes,
  };
}

export function approachOf(value: string): Approach {
  if (value === "A" || value === "B" || value === "C") return value;
  return "C";
}
