import type {
  Approach,
  CardKind,
  Intent,
  InteractionState,
  Posture,
  Role,
  Signals,
  Thresholds,
  Topic,
} from "./types.ts";

export interface Decision {
  speak: boolean;
  retrieve: boolean;
  kinds: CardKind[];
  ruleId: string;
  silenceReason: string;
  why: string;
  topic: Topic | null;
  intent: Intent;
  signature: string;
  policyIds: string[];
  confidence: number;
  hints: string[];
}

interface DecideInput {
  role: Role;
  signals: Signals;
  state: InteractionState;
  approach: Approach;
  posture: Posture;
  thresholds: Thresholds;
  suppression: boolean;
}

function signature(kind: string, topic: string, intent: string): string {
  return `${kind}:${topic}:${intent}`;
}

function recentlyEmitted(state: InteractionState, sig: string, cooldown: number): boolean {
  return state.interventions.some((mark) => mark.signature === sig && state.turn - mark.turn < cooldown);
}

function coveredSame(state: InteractionState, topic: Topic, intent: Intent): boolean {
  return state.covered.some((mark) => {
    const recent = state.turn - mark.turn <= 4 && state.turn - mark.turn >= 0;
    const sameTopic = mark.topic === topic;
    const sameIntent = mark.intent === intent || (mark.intent === "informacao" && intent === "informacao");
    return recent && sameTopic && sameIntent;
  });
}

export function decide(input: DecideInput): Decision {
  const { signals, state, approach, posture, thresholds, suppression, role } = input;
  const topic: Topic | null =
    signals.topic.id !== "outro" && signals.topic.confidence >= 0.45
      ? signals.topic.id
      : signals.facet && state.topic
        ? state.topic === "anuidade"
          ? "isencao"
          : state.topic
        : signals.topic.id !== "outro"
          ? signals.topic.id
          : state.topic;
  const inherited = signals.topic.confidence < 0.45 && signals.facet && Boolean(state.topic);
  const intent: Intent =
    signals.facet && (topic === "isencao" || topic === "anuidade") && (signals.intent.id === "outro" || signals.intent.id === "informacao")
      ? "negociacao"
      : signals.intent.id;
  const confidence = inherited ? Math.max(signals.topic.confidence, signals.intent.confidence, 0.72) : Math.max(signals.topic.confidence, signals.intent.confidence);
  const rawHints = [topic, intent, signals.tier, signals.product.id, ...signals.topic.runners.map((runner) => runner.id)];
  const hints = rawHints.filter((hint) => Boolean(hint) && hint !== "outro" && hint !== "geral") as string[];

  const base = {
    topic,
    intent,
    confidence,
    hints,
    policyIds: [] as string[],
    kinds: [] as CardKind[],
    retrieve: false,
    speak: false,
    signature: signature("silence", topic ?? "outro", intent),
    silenceReason: "",
    why: "",
    ruleId: "",
  };

  if (posture === "reactive") {
    return {
      ...base,
      speak: true,
      retrieve: true,
      kinds: ["reply"],
      ruleId: "REACTIVE_ASK",
      why: "O operador pediu. A postura reativa responde e não aplica silêncio.",
      signature: signature("reply", topic ?? "geral", "informacao"),
      policyIds: ["POL-CONDUTA"],
    };
  }

  if (role === "operator") {
    const secret = signals.risks.find((risk) => risk.id === "dado_sensivel");
    if (secret) {
      return {
        ...base,
        speak: true,
        kinds: ["alert"],
        ruleId: "OPERADOR_SEGREDO",
        why: "A fala do operador pede um segredo. Isso é alerta, não sugestão ao cliente.",
        signature: signature("alert", "senha", "dado_sensivel"),
        confidence: secret.confidence,
        policyIds: ["POL-SENHA-07"],
      };
    }
    return {
      ...base,
      ruleId: "OPERADOR_ESTADO",
      silenceReason: "Fala do operador. O estado foi atualizado e nada é sugerido de volta.",
      why: "Quem conduz é o operador. O copiloto só observa cobertura do assunto.",
    };
  }

  if (signals.injection) {
    return {
      ...base,
      speak: true,
      kinds: ["alert"],
      ruleId: "INJECAO",
      why: "A fala tenta reescrever regra. Trata-se como dado do cliente, sem obedecer.",
      signature: signature("alert", "outro", "injecao"),
      confidence: 0.97,
      policyIds: ["POL-INJECAO-09"],
    };
  }

  if (approach === "A") {
    return {
      ...base,
      speak: true,
      retrieve: true,
      kinds: signals.phatic || signals.ack ? ["guidance"] : ["reply"],
      ruleId: "SEMPRE",
      why: "Abordagem A emite sugestão em toda fala de cliente, sem portão de valor.",
      signature: signature("always", topic ?? "outro", intent),
      policyIds: ["POL-CONDUTA"],
    };
  }

  if (signals.phatic) {
    return { ...base, ruleId: "SAUDACAO", silenceReason: "Saudação. Não há pedido para apoiar.", why: "Silêncio: cumprimento não pede conhecimento." };
  }
  if (signals.ack) {
    return { ...base, ruleId: "ACK", silenceReason: "Reconhecimento curto. A conversa segue com o operador.", why: "Silêncio: confirmação vazia." };
  }
  if (signals.intent.id === "resolucao" || state.resolution === "resolvida" && signals.sentiment.score > 0.2 && !signals.facet) {
    return {
      ...base,
      ruleId: "RESOLVIDO",
      silenceReason: "O cliente encerrou. Intervir agora só atrapalha.",
      why: "Silêncio: resolução já expressa.",
    };
  }

  if (signals.ambiguous) {
    return {
      ...base,
      speak: true,
      kinds: ["guidance"],
      topic: null,
      ruleId: "AMBIGUO",
      why: "Há preço, sem produto. A intervenção útil é uma pergunta, não um artigo.",
      signature: signature("guidance", "outro", "ambiguo"),
      confidence: 0.62,
      policyIds: ["POL-CONDUTA"],
    };
  }

  const alertRisk = signals.risks.find((risk) => risk.id === "fraude" || risk.id === "regulatorio" || risk.id === "dado_sensivel");
  const churn = signals.risks.find((risk) => risk.id === "churn");

  if (alertRisk) {
    const kinds: CardKind[] = ["alert"];
    if (alertRisk.id !== "dado_sensivel") kinds.push("guidance");
    const decision: Decision = {
      ...base,
      speak: true,
      retrieve: alertRisk.id !== "dado_sensivel",
      kinds,
      ruleId: alertRisk.id === "fraude" ? "ALERTA_FRAUDE" : alertRisk.id === "regulatorio" ? "ALERTA_REGULATORIO" : "ALERTA_DADO",
      why:
        alertRisk.id === "fraude"
          ? "Fraude percebida. Alerta e procedimento, sem oferta."
          : "Situação sensível. O destaque vale mais do que uma resposta pronta.",
      signature: signature("alert", topic ?? alertRisk.id, intent),
      confidence: alertRisk.confidence,
      policyIds: alertRisk.id === "fraude" ? ["POL-FRAUDE-05"] : ["POL-CONDUTA"],
    };
    return applySuppression(decision, input, topic, intent);
  }

  if (confidence < thresholds.minConfidence && !churn) {
    return {
      ...base,
      ruleId: "CONFIANCA",
      silenceReason: `Confiança ${confidence.toFixed(2)} abaixo de ${thresholds.minConfidence.toFixed(2)}. Sem chute.`,
      why: "Silêncio: sinal fraco.",
    };
  }

  let kinds: CardKind[];
  let ruleId: string;
  let why: string;
  let policies: string[];
  if (intent === "objecao_preco" || intent === "cancelamento" || intent === "negociacao" || churn) {
    kinds = ["guidance", "reply"];
    ruleId = churn ? "RETENCAO" : "OBJECAO";
    why = "Objeção com caminho de política. Orientação para o operador e um texto curto, se houver fonte.";
    policies = ["POL-RETENCAO-03", "POL-ANUIDADE-01"];
  } else if (intent === "comercial") {
    kinds = ["reply"];
    ruleId = "COMERCIAL_PEDIDO";
    why = "O cliente perguntou o benefício. Resposta factual, sem empurrar upgrade.";
    policies = ["POL-UPSELL-08"];
  } else {
    kinds = ["reply"];
    ruleId = "INFORMACAO";
    why = "Pergunta factual com assunto estável. Uma resposta fundamentada basta.";
    policies = ["POL-CONDUTA"];
  }

  const decision: Decision = {
    ...base,
    speak: true,
    retrieve: true,
    kinds,
    ruleId,
    why,
    signature: signature(kinds[0] ?? "reply", topic ?? "outro", intent),
    policyIds: policies,
    confidence,
  };
  if (approach === "B") return decision;
  return applySuppression(decision, input, topic, intent);
}

function applySuppression(decision: Decision, input: DecideInput, topic: Topic | null, intent: Intent): Decision {
  if (!input.suppression || !decision.speak) return decision;
  if (decision.ruleId.startsWith("ALERTA") || decision.ruleId === "INJECAO" || decision.ruleId === "OPERADOR_SEGREDO") {
    return decision;
  }
  if (recentlyEmitted(input.state, decision.signature, input.thresholds.cooldownTurns)) {
    return {
      ...decision,
      speak: false,
      retrieve: false,
      kinds: [],
      ruleId: "DEDUP",
      silenceReason: "Sugestão equivalente ainda está no cooldown. Não repetir.",
      why: "Supressão: mesma assinatura recente.",
    };
  }
  const priorScore = input.state.sentiment.history.slice(-2, -1)[0];
  const worsened = priorScore !== undefined && input.signals.sentiment.score < priorScore - 0.2;
  if (topic && !input.signals.facet && !worsened && coveredSame(input.state, topic, intent)) {
    return {
      ...decision,
      speak: false,
      retrieve: false,
      kinds: [],
      ruleId: "COBERTO",
      silenceReason: "O operador já tratou este assunto e o cliente não abriu uma faceta nova.",
      why: "Supressão: cobertura recente do operador.",
    };
  }
  return decision;
}
