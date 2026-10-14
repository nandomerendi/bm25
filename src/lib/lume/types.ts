export type Role = "customer" | "operator";

export type Approach = "A" | "B" | "C";

export type Posture = "proactive" | "reactive";

export type Product = "cartao" | "conta" | "app" | "geral";

export type Tier = "classic" | "gold" | "infinite";

export type Topic =
  | "anuidade"
  | "isencao"
  | "cancelamento"
  | "fraude"
  | "fatura"
  | "limite"
  | "cashback"
  | "viagem"
  | "senha"
  | "outro";

export type Intent =
  | "informacao"
  | "objecao_preco"
  | "cancelamento"
  | "reclamacao"
  | "negociacao"
  | "comercial"
  | "fraude"
  | "saudacao"
  | "resolucao"
  | "injecao"
  | "ambiguo"
  | "outro";

export type SentimentLabel = "positivo" | "neutro" | "atencao" | "negativo" | "critico";

export type Trend = "melhorando" | "estavel" | "piorando";

export type Journey =
  | "abertura"
  | "esclarecimento"
  | "objecao"
  | "retencao"
  | "resolucao"
  | "encerramento"
  | "oportunidade";

export type CardKind = "knowledge" | "reply" | "guidance" | "alert";

export type RiskId = "churn" | "regulatorio" | "fraude" | "injecao" | "dado_sensivel";

export interface Klass<T extends string> {
  id: T;
  confidence: number;
  evidence: string[];
}

export interface Signals {
  product: Klass<Product>;
  tier: Tier | null;
  tierSource: "fala" | "nenhum";
  topic: Klass<Topic> & { runners: { id: Topic; confidence: number }[] };
  intent: Klass<Intent>;
  sentiment: { label: SentimentLabel; score: number; evidence: string[] };
  risks: { id: RiskId; confidence: number; evidence: string[] }[];
  injection: boolean;
  phatic: boolean;
  ack: boolean;
  facet: boolean;
  ambiguous: boolean;
}

export interface CoverMark {
  topic: Topic;
  intent: Intent;
  turn: number;
}

export interface InterventionMark {
  signature: string;
  kind: CardKind;
  turn: number;
}

export interface InteractionState {
  turn: number;
  product: Product | null;
  tier: Tier | null;
  topic: Topic | null;
  intent: Intent | null;
  objection: string | null;
  sentiment: {
    label: SentimentLabel;
    score: number;
    trend: Trend;
    history: number[];
  };
  journey: Journey;
  covered: CoverMark[];
  interventions: InterventionMark[];
  resolution: "aberta" | "em_andamento" | "resolvida";
  riskFlags: RiskId[];
}

export interface Thresholds {
  minConfidence: number;
  minRetrieval: number;
  cooldownTurns: number;
  maxCards: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minConfidence: 0.48,
  minRetrieval: 1.4,
  cooldownTurns: 3,
  maxCards: 2,
};

export interface StageTiming {
  stage: string;
  ms: number;
}

export interface SourceRef {
  docId: string;
  title: string;
  section: string;
  excerpt: string;
  score: number;
}

export interface Card {
  id: string;
  kind: CardKind;
  level: 2 | 3 | 4 | 5;
  title: string;
  body: string;
  reply?: string;
  sources: SourceRef[];
  confidence: number;
  signature: string;
  why: string;
  ruleId: string;
  policyIds: string[];
  generation: "nenhuma" | "template" | "modelo";
  expiresOnTurn: number;
}

export interface Silence {
  reason: string;
  ruleId: string;
}

export interface Audit {
  observed: string[];
  inferred: string[];
  decision: string;
  ruleId: string;
}

export interface RetrievalDebug {
  strategy: "hibrido-bm25-tags";
  lexicalTop: { id: string; title: string; score: number }[];
  hybridTop: { id: string; title: string; score: number; tags: string[] }[];
  used: string[];
  rejected: boolean;
}

export interface TokenEstimate {
  policyLlmCalls: number;
  promptTokens: number;
  note: string;
}

export interface TurnResult {
  state: InteractionState;
  signals: Signals;
  cards: Card[];
  silence: Silence | null;
  audit: Audit;
  timings: StageTiming[];
  totalMs: number;
  llmCalls: number;
  tokens: TokenEstimate;
  approach: Approach;
  posture: Posture;
  retrieval: RetrievalDebug | null;
  effectiveTier: Tier | null;
  tierSource: "fala" | "screen-pop-sintetico" | "nenhum";
  payloadBytes: number;
}

export interface TurnInput {
  text: string;
  role: Role;
  state: InteractionState | null;
  approach: Approach;
  posture: Posture;
  thresholds?: Partial<Thresholds>;
  suppression?: boolean;
  stateless?: boolean;
}

export const TOPIC_LABEL: Record<Topic, string> = {
  anuidade: "Anuidade",
  isencao: "Isenção",
  cancelamento: "Cancelamento",
  fraude: "Fraude",
  fatura: "Fatura",
  limite: "Limite",
  cashback: "Cashback",
  viagem: "Viagem",
  senha: "Senha do app",
  outro: "Assunto aberto",
};

export const INTENT_LABEL: Record<Intent, string> = {
  informacao: "Informação",
  objecao_preco: "Objeção de preço",
  cancelamento: "Cancelamento",
  reclamacao: "Reclamação",
  negociacao: "Negociação",
  comercial: "Oportunidade comercial",
  fraude: "Fraude",
  saudacao: "Saudação",
  resolucao: "Resolução",
  injecao: "Instrução embutida",
  ambiguo: "Ambíguo",
  outro: "Sem intenção clara",
};

export const SENTIMENT_LABEL: Record<SentimentLabel, string> = {
  positivo: "Positivo",
  neutro: "Neutro",
  atencao: "Atenção",
  negativo: "Negativo",
  critico: "Crítico",
};

export const JOURNEY_LABEL: Record<Journey, string> = {
  abertura: "Abertura",
  esclarecimento: "Esclarecimento",
  objecao: "Objeção",
  retencao: "Retenção",
  resolucao: "Resolução",
  encerramento: "Encerramento",
  oportunidade: "Oportunidade",
};

export const KIND_LABEL: Record<CardKind, string> = {
  knowledge: "Conhecimento",
  reply: "Resposta sugerida",
  guidance: "Orientação",
  alert: "Alerta",
};

export const APPROACH_LABEL: Record<Approach, string> = {
  A: "A · sempre",
  B: "B · classificar",
  C: "C · motor",
};
