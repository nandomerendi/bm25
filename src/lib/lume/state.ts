import type { InteractionState, Journey, Role, Signals, Trend } from "./types.ts";

export function emptyState(): InteractionState {
  return {
    turn: 0,
    product: null,
    tier: null,
    topic: null,
    intent: null,
    objection: null,
    sentiment: { label: "neutro", score: 0, trend: "estavel", history: [] },
    journey: "abertura",
    covered: [],
    interventions: [],
    resolution: "aberta",
    riskFlags: [],
  };
}

function journeyFor(signals: Signals, prior: Journey): Journey {
  if (signals.injection) return prior === "abertura" ? "esclarecimento" : prior;
  if (signals.intent.id === "fraude" || signals.risks.some((risk) => risk.id === "fraude" || risk.id === "regulatorio")) {
    return "resolucao";
  }
  if (signals.intent.id === "resolucao") return "encerramento";
  if (signals.intent.id === "saudacao" || signals.phatic) return prior === "abertura" ? "abertura" : prior;
  if (signals.intent.id === "comercial" && signals.sentiment.score > -0.15) return "oportunidade";
  if (signals.intent.id === "cancelamento" || signals.intent.id === "objecao_preco" || signals.intent.id === "negociacao") {
    return "retencao";
  }
  if (signals.intent.id === "reclamacao") return "objecao";
  if (signals.intent.id === "ambiguo") return prior === "abertura" ? "esclarecimento" : prior;
  if (signals.topic.confidence >= 0.48 && signals.intent.id === "informacao") {
    return prior === "retencao" ? "retencao" : "esclarecimento";
  }
  return prior;
}

export function reduceState(
  prior: InteractionState,
  message: { role: Role; text: string; signals: Signals },
): InteractionState {
  const { signals, role } = message;
  const confident = signals.topic.confidence >= 0.48 && signals.topic.id !== "outro";
  const previous = prior.sentiment.score;
  const delta = signals.sentiment.score - previous;
  const trend: Trend = delta > 0.12 ? "melhorando" : delta < -0.12 ? "piorando" : "estavel";
  const history =
    role === "customer" ? [...prior.sentiment.history, signals.sentiment.score].slice(-12) : prior.sentiment.history;
  const sentiment =
    role === "customer"
      ? { label: signals.sentiment.label, score: signals.sentiment.score, trend, history }
      : { ...prior.sentiment, history };

  const covered = prior.covered.slice(-12);
  if (role === "operator" && confident) {
    covered.push({ topic: signals.topic.id, intent: signals.intent.id === "outro" ? "informacao" : signals.intent.id, turn: prior.turn + 1 });
    for (const runner of signals.topic.runners) {
      if (runner.confidence >= 0.55) {
        covered.push({ topic: runner.id, intent: "informacao", turn: prior.turn + 1 });
      }
    }
  }

  let resolution = prior.resolution;
  if (signals.intent.id === "resolucao") resolution = "resolvida";
  else if (role === "operator" && confident) resolution = prior.resolution === "resolvida" ? "resolvida" : "em_andamento";
  else if (role === "customer" && confident && resolution === "resolvida") resolution = "aberta";

  const objection =
    signals.intent.id === "objecao_preco" ? "preco" : signals.intent.id === "cancelamento" ? "permanencia" : prior.objection;

  const riskFlags = Array.from(new Set([...prior.riskFlags, ...signals.risks.map((risk) => risk.id)])).slice(-8);

  return {
    turn: prior.turn + 1,
    product: signals.product.confidence >= 0.5 ? signals.product.id : prior.product,
    tier: signals.tier ?? prior.tier,
    topic: confident ? signals.topic.id : prior.topic,
    intent: signals.intent.confidence >= 0.45 ? signals.intent.id : prior.intent,
    objection,
    sentiment,
    journey: signals.ack || signals.phatic ? prior.journey : journeyFor(signals, prior.journey),
    covered,
    interventions: prior.interventions.slice(-20),
    resolution,
    riskFlags,
  };
}
