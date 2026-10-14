import { Bm25 } from "./bm25.ts";
import { fold, hasPhrase } from "./text.ts";
import type { Intent, Product, RiskId, Role, SentimentLabel, Signals, Tier, Topic } from "./types.ts";

interface PhraseRule<T extends string> {
  id: T;
  phrases: string[];
  weight: number;
}

const TOPICS: PhraseRule<Topic>[] = [
  { id: "anuidade", phrases: ["anuidade", "mensalidade do cartao", "taxa do cartao", "anuidade cara"], weight: 1 },
  { id: "isencao", phrases: ["isencao", "isento", "zerar a anuidade", "nao chegar", "cinco mil"], weight: 0.9 },
  { id: "cancelamento", phrases: ["cancelar", "cancelamento", "encerrar o cartao", "nao quero mais o cartao", "quero cancelar"], weight: 1 },
  { id: "fraude", phrases: ["fraude", "clonaram", "clonado", "nao reconheco", "compra que nao fiz", "compra que eu nao fiz", "golpe", "cartao roubado"], weight: 1 },
  { id: "fatura", phrases: ["fatura", "fechamento", "vencimento", "parcelar", "parcelamento", "rotativo", "juros"], weight: 0.9 },
  { id: "limite", phrases: ["limite", "aumentar o limite", "aumento de limite"], weight: 1 },
  { id: "cashback", phrases: ["cashback", "dinheiro de volta"], weight: 1 },
  { id: "viagem", phrases: ["viagem", "viajar", "sala vip", "lounge", "aeroporto", "loungekey"], weight: 0.95 },
  { id: "senha", phrases: ["senha", "cvv", "token", "esqueci minha senha", "codigo de seguranca"], weight: 1 },
];

const INTENTS: PhraseRule<Intent>[] = [
  { id: "fraude", phrases: ["fraude", "clonaram", "clonado", "nao reconheco", "compra que nao fiz", "compra que eu nao fiz", "golpe"], weight: 1 },
  { id: "cancelamento", phrases: ["cancelar", "cancelamento", "encerrar o cartao", "nao quero mais", "quero sair"], weight: 1 },
  { id: "objecao_preco", phrases: ["caro", "cara", "nao vale", "muito cara", "muito caro", "absurdo", "taxa alta", "nao compensa"], weight: 0.9 },
  { id: "reclamacao", phrases: ["pessimo", "horrivel", "indignado", "indignada", "nunca mais", "ridiculo", "lixo", "raiva"], weight: 0.85 },
  { id: "comercial", phrases: ["sala vip", "lounge", "cashback", "beneficio", "viajar", "viagem"], weight: 0.7 },
  { id: "negociacao", phrases: ["desconto", "alguma condicao", "e se eu nao", "consegue isentar"], weight: 0.8 },
  { id: "informacao", phrases: ["quando", "como", "qual", "quanto", "quais", "onde", "por que", "porque"], weight: 0.55 },
];

const PROTO = new Bm25([
  { id: "anuidade", text: "anuidade do cartao esta cara nao sei se vale a pena continuar pagando a taxa" },
  { id: "isencao", text: "como ficar isento da anuidade se eu gastar cinco mil por mes ou nao chegar no valor" },
  { id: "cancelamento", text: "quero cancelar o cartao encerrar a conta e nao continuar" },
  { id: "fraude", text: "clonaram meu cartao tem uma compra que eu nao fiz no mercado fraude" },
  { id: "fatura", text: "quando fecha a fatura qual o vencimento e como parcelar o rotativo" },
  { id: "limite", text: "quero aumentar o limite do cartao da para subir" },
  { id: "cashback", text: "como funciona o cashback e quando cai o dinheiro de volta" },
  { id: "viagem", text: "vou viajar a sala vip do aeroporto lounge esta inclusa no cartao" },
  { id: "senha", text: "esqueci a senha do aplicativo e nao consigo entrar" },
]);

const REGULATORY = ["procon", "banco central", "processar", "processo", "advogad", "reclame aqui"];

const SENTIMENT_TERMS: { phrase: string; delta: number }[] = [
  { phrase: "procon", delta: -0.55 },
  { phrase: "processar", delta: -0.5 },
  { phrase: "advogad", delta: -0.45 },
  { phrase: "absurdo", delta: -0.45 },
  { phrase: "pessimo", delta: -0.45 },
  { phrase: "nunca mais", delta: -0.4 },
  { phrase: "indignad", delta: -0.4 },
  { phrase: "raiva", delta: -0.35 },
  { phrase: "nao vale", delta: -0.28 },
  { phrase: "insatisfeit", delta: -0.28 },
  { phrase: "caro", delta: -0.14 },
  { phrase: "cara", delta: -0.14 },
  { phrase: "obrigad", delta: 0.4 },
  { phrase: "perfeito", delta: 0.34 },
  { phrase: "otimo", delta: 0.3 },
  { phrase: "excelente", delta: 0.3 },
  { phrase: "resolvido", delta: 0.28 },
  { phrase: "adorei", delta: 0.28 },
];

function matchRules<T extends string>(folded: string, rules: PhraseRule<T>[]) {
  return rules
    .map((rule) => {
      const evidence = rule.phrases.filter((phrase) => folded.includes(fold(phrase)));
      if (!evidence.length) return null;
      const confidence = Math.min(0.94, 0.52 + 0.16 * (evidence.length - 1) + rule.weight * 0.12);
      return { id: rule.id, confidence, evidence };
    })
    .filter((hit): hit is { id: T; confidence: number; evidence: string[] } => Boolean(hit))
    .sort((a, b) => b.confidence - a.confidence);
}

function sentimentOf(folded: string): Signals["sentiment"] {
  let score = 0;
  const evidence: string[] = [];
  for (const term of SENTIMENT_TERMS) {
    if (folded.includes(fold(term.phrase))) {
      score += term.delta;
      evidence.push(term.phrase);
    }
  }
  score = Math.max(-1, Math.min(1, Math.round(score * 100) / 100));
  let label: SentimentLabel = "neutro";
  if (score >= 0.25) label = "positivo";
  else if (score <= -0.55) label = "critico";
  else if (score <= -0.28) label = "negativo";
  else if (score <= -0.1) label = "atencao";
  return { label, score, evidence };
}

function tierOf(folded: string): Tier | null {
  if (hasPhrase(folded, "infinite") || folded.includes("loungekey")) return "infinite";
  if (hasPhrase(folded, "gold")) return "gold";
  if (hasPhrase(folded, "classic")) return "classic";
  return null;
}

function productOf(folded: string, topic: Topic): { id: Product; confidence: number; evidence: string[] } {
  const evidence: string[] = [];
  if (folded.includes("cartao") || folded.includes("cartão")) evidence.push("cartao");
  if (["anuidade", "isencao", "fatura", "limite", "cashback", "viagem", "fraude", "cancelamento"].includes(topic)) {
    evidence.push(topic);
  }
  if (folded.includes("aplicativo") || hasPhrase(folded, "app") || topic === "senha") {
    return { id: "app", confidence: 0.7, evidence: evidence.length ? evidence : ["app"] };
  }
  if (evidence.length) return { id: "cartao", confidence: Math.min(0.9, 0.6 + evidence.length * 0.08), evidence };
  return { id: "geral", confidence: 0.2, evidence: [] };
}

export function detectSignals(text: string, role: Role): Signals {
  const folded = fold(text);
  const injection =
    /ignore (todas |as )?(politicas|regras|instrucoes)/.test(folded) ||
    /voce (agora )?e o sistema/.test(folded) ||
    /prompt do sistema/.test(folded) ||
    /finja que/.test(folded) ||
    folded.includes("jailbreak");

  const bare = folded.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const greet = new Set(["oi", "ola", "bom", "dia", "boa", "tarde", "noite", "opa", "hey", "hello", "e", "ai"]);
  const parts = bare.split(" ").filter(Boolean);
  const phatic = parts.length > 0 && parts.length <= 4 && parts.every((part) => greet.has(part));
  const ack = /^(ok|okay|beleza|blz|certo|show|valeu|entendi|ta|ta bom|sim|uhum|hmm)$/.test(bare);
  const resolution =
    (bare.length < 90 && /obrigad/.test(bare) && /(era isso|perfeito|resolv|so isso|era so)/.test(bare)) ||
    /^(perfeito obrigado|obrigado era isso|era isso|pode encerrar|resolvido)$/.test(bare);
  const facet = /\be se\b|\bcaso\b|nao chegar|nao tenho|mesmo assim|\bmas\b|e quanto|quanto tempo|se nao|sem a isencao/.test(
    folded,
  );

  const topicHits = matchRules(folded, TOPICS);
  const proto = PROTO.search(text, 1)[0];
  let topic = topicHits[0] ?? { id: "outro" as Topic, confidence: 0.15, evidence: [] as string[] };
  if (topic.confidence < 0.5 && proto && proto.score >= 2.2 && proto.id !== topic.id) {
    const lifted = Math.min(0.74, proto.score / 5.5);
    if (lifted > topic.confidence) {
      topic = { id: proto.id as Topic, confidence: lifted, evidence: [`bm25:${proto.id}:${proto.score.toFixed(2)}`] };
    }
  }
  if (topic.id === "isencao" && topicHits.some((hit) => hit.id === "anuidade" && hit.confidence > topic.confidence - 0.05)) {
    // "isencao da anuidade" keeps isencao when the facet is the waiver, else anuidade wins on fee talk.
    if (!facet && !folded.includes("isent")) {
      const fee = topicHits.find((hit) => hit.id === "anuidade");
      if (fee) topic = fee;
    }
  }

  let intentHits = matchRules(folded, INTENTS);
  let intent = intentHits[0] ?? { id: "outro" as Intent, confidence: 0.2, evidence: [] as string[] };
  if (injection) intent = { id: "injecao", confidence: 0.96, evidence: ["instrucao embutida na fala"] };
  else if (resolution) intent = { id: "resolucao", confidence: 0.9, evidence: ["formulacao de encerramento"] };
  else if (phatic) intent = { id: "saudacao", confidence: 0.92, evidence: ["saudacao isolada"] };
  else if (ack) intent = { id: "outro", confidence: 0.3, evidence: ["reconhecimento curto"] };
  else if (topic.id === "fraude") intent = { id: "fraude", confidence: Math.max(intent.confidence, 0.86), evidence: topic.evidence };
  else if (topic.id === "senha" && intent.id === "outro")
    intent = { id: "informacao", confidence: 0.72, evidence: topic.evidence };

  const price = /\bcaro\b|\bcara\b|nao vale|absurdo|taxa alta/.test(folded);
  const ambiguous = price && topic.confidence < 0.48 && !injection && !phatic;
  if (ambiguous && intent.id !== "cancelamento" && intent.id !== "fraude") {
    intent = { id: "ambiguo", confidence: 0.62, evidence: intent.evidence.concat(["preco sem produto"]) };
  }
  if (facet && (topic.id === "isencao" || topic.id === "anuidade") && intent.id === "informacao") {
    intent = { id: "negociacao", confidence: Math.max(0.7, intent.confidence), evidence: intent.evidence.concat(["nova faceta"]) };
  }

  const sentiment = sentimentOf(folded);
  const tier = tierOf(folded);
  const product = productOf(folded, topic.id);

  const risks: Signals["risks"] = [];
  if (injection) risks.push({ id: "injecao", confidence: 0.97, evidence: ["padrao de instrucao"] });
  if (topic.id === "fraude" || intent.id === "fraude") {
    risks.push({ id: "fraude", confidence: 0.9, evidence: topic.evidence });
  }
  if (REGULATORY.some((term) => folded.includes(fold(term)))) {
    risks.push({ id: "regulatorio", confidence: 0.92, evidence: REGULATORY.filter((term) => folded.includes(fold(term))) });
  }
  if (
    intent.id === "cancelamento" ||
    (intent.id === "objecao_preco" && sentiment.score <= -0.28) ||
    folded.includes("nao sei se vale a pena")
  ) {
    risks.push({
      id: "churn",
      confidence: intent.id === "cancelamento" ? 0.84 : 0.66,
      evidence: ["sinal de permanencia"],
    });
  }
  if (role === "operator" && /senha completa|cvv|codigo de seguranca|token que chegou|me passa a senha|sua senha/.test(folded)) {
    risks.push({ id: "dado_sensivel", confidence: 0.95, evidence: ["pedido de segredo na fala do operador"] });
  }
  if (role === "customer" && /\b(cvv|senha completa)\b/.test(folded) && folded.includes("minha senha e")) {
    risks.push({ id: "dado_sensivel", confidence: 0.8, evidence: ["cliente oferecendo segredo"] });
  }

  const runners = topicHits.filter((hit) => hit.id !== topic.id).slice(0, 2);

  return {
    product,
    tier,
    tierSource: tier ? "fala" : "nenhum",
    topic: { ...topic, runners },
    intent,
    sentiment,
    risks,
    injection,
    phatic,
    ack,
    facet,
    ambiguous,
  };
}
