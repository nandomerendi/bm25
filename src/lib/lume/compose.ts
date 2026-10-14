import { clip, estimateTokens, fold } from "./text.ts";
import { FACTS, SCREEN_POP, retentionEligible, type Doc } from "./knowledge.ts";
import type { Decision } from "./opportunity.ts";
import type { Card, CardKind, Signals, SourceRef, Tier } from "./types.ts";

const OFFERS = [/isencao permanente/, /anuidade gratis/, /anuidade zero/, /garantimos o limite/, /passe a senha/, /informe o cvv/, /senha completa e/];

export function badPromise(text: string): boolean {
  const sentences = fold(text).split(/[.!?\n]/);
  return sentences.some(
    (sentence) => OFFERS.some((pattern) => pattern.test(sentence)) && !/\bnao\b|\bnunca\b|\bsem prometer\b|\bnao prometa\b|\bnao confirme\b|\bnao peca\b|\bnao oferec/.test(sentence),
  );
}

function tierFacts(tier: Tier | null) {
  if (tier === "classic") return FACTS.classic;
  if (tier === "infinite") return FACTS.infinite;
  if (tier === "gold") return FACTS.gold;
  return null;
}

function replyFor(decision: Decision, tier: Tier | null, askedInfinite: boolean): string {
  const facts = tierFacts(tier);
  if (decision.topic === "anuidade" || decision.intent === "objecao_preco") {
    if (!facts) {
      return clip(
        `A anuidade depende do cartão: Classic ${FACTS.classic.annual}, Gold ${FACTS.gold.annual} e Infinite ${FACTS.infinite.annual} por ano. Qual é o seu para eu te falar da isenção certa?`,
      );
    }
    return clip(
      `A anuidade do ${facts.name} é ${facts.annual} por ano. Há isenção com ${facts.waiver}. Posso olhar com você se o gasto recente chega perto disso?`,
    );
  }
  if (decision.topic === "isencao" || decision.intent === "negociacao") {
    const facts = tierFacts(tier);
    const rule = facts ? `No ${facts.name}, a isenção por uso pede ${facts.waiver}.` : "A isenção por uso depende do cartão.";
    const offer = retentionEligible()
      ? `No cadastro sintético há ${SCREEN_POP.tenureMonths} meses sem atraso: a alçada permite oferecer ${FACTS.retention.freeMonths}, e eu confirmo no sistema antes de prometer.`
      : `A isenção de ${FACTS.retention.freeMonths} só cabe com ${FACTS.retention.tenure} e ${FACTS.retention.delinquency}.`;
    return clip(`${rule} ${offer} Não é isenção permanente, e o cancelamento continua disponível.`);
  }
  if (decision.topic === "cancelamento") {
    return clip(
      `Você pode cancelar quando quiser, sem multa. A anuidade paga e não usufruída volta de forma proporcional ${FACTS.cancelRefund}. Se quiser, antes eu te explico a isenção de ${FACTS.retention.freeMonths} — e respeito se a resposta for não.`,
    );
  }
  if (decision.topic === "fatura") {
    return clip(
      `O fechamento padrão desta base é ${FACTS.invoiceClose} e o vencimento ${FACTS.invoiceDue}, salvo o que estiver na sua fatura. O parcelamento pelo app começa em ${FACTS.installmentMin}.`,
    );
  }
  if (decision.topic === "fraude") {
    return clip(
      `Vamos bloquear o cartão agora pelo app. Não me envie senha nem CVV. A contestação pode ser aberta em até ${FACTS.contestDays}; o estorno não é imediato.`,
    );
  }
  if (decision.topic === "senha") {
    return clip(`A senha se redefine no próprio app, em “esqueci minha senha”. Não compartilhe senha, CVV ou token aqui no chat.`);
  }
  if (decision.topic === "limite") {
    return clip(`O aumento de limite passa por análise no app. Eu não consigo prometer valor nem aprovação por aqui.`);
  }
  if (decision.topic === "viagem" || decision.intent === "comercial") {
    if (askedInfinite || tier === "infinite") {
      return clip(
        `Sala VIP LoungeKey é do ${FACTS.infinite.name}: ${FACTS.infinite.lounge}. O Gold não inclui esse pacote. Posso só explicar a diferença, sem te empurrar troca.`,
      );
    }
    return clip(
      `Sala VIP LoungeKey é benefício do Infinite (${FACTS.infinite.lounge}). O ${FACTS.gold.name} do seu cadastro não inclui. Se quiser, eu comparo os cartões — só se você pedir.`,
    );
  }
  if (decision.topic === "cashback" && facts && "cashback" in facts) {
    return clip(`No ${facts.name} o cashback é ${facts.cashback} sobre compras elegíveis, creditado na fatura seguinte. Saque e tributo não entram.`);
  }
  return clip(`Vou me apoiar só no que está na base interna. Se faltar um número, eu digo que não tenho — em vez de completar.`);
}

function guidanceFor(decision: Decision, tier: Tier | null): string {
  if (decision.ruleId === "AMBIGUO") {
    return "Pergunte qual produto ou tarifa está cara antes de abrir artigo. Sem isso, qualquer anuidade é chute.";
  }
  if (decision.topic === "fraude" || decision.ruleId === "ALERTA_FRAUDE") {
    return "Bloqueio pelo app, contestação no prazo da política, zero pedido de senha ou CVV. Não ofereça produto nenhum neste caso.";
  }
  if (decision.ruleId === "ALERTA_REGULATORIO") {
    return "Não debata Procon, processo ou Banco Central. Confirme o que a pessoa quer resolver agora e siga o caminho operacional. Sem oferta.";
  }
  if (decision.intent === "negociacao" || decision.topic === "isencao") {
    const fit = retentionEligible()
      ? `Screen pop sintético: ${SCREEN_POP.tenureMonths} meses e sem atraso. A política permite oferecer ${FACTS.retention.freeMonths} de isenção do ${tier === "classic" ? "Classic" : "Gold"}.`
      : "O screen pop sintético não autoriza a oferta. Não invente alçada.";
    return `${fit} Confirme no sistema antes de falar. Não prometa isenção permanente nem empate oferta de outro banco. Se a pessoa recusar, cancele sem atrito.`;
  }
  if (decision.intent === "objecao_preco" || decision.intent === "cancelamento" || decision.ruleId === "RETENCAO") {
    return `Confirme o cartão (${tier ? tierFacts(tier)?.name : "tier ainda aberto"}) e se o gasto cumpre a isenção por uso. Só depois fale da alçada de ${FACTS.retention.freeMonths}. Não prometa isenção permanente.`;
  }
  if (decision.topic === "senha") {
    return "Oriente a redefinição no app. Se a pessoa começar a ditar a senha, interrompa.";
  }
  if (decision.intent === "comercial") {
    return "Responda só o que foi perguntado. Upgrade fica de fora enquanto você não ouvir um pedido explícito e um tom calmo.";
  }
  return "Use o trecho da base. Se a fonte não cobrir o número, diga que vai confirmar — não complete de memória.";
}

function alertBody(decision: Decision): string {
  if (decision.ruleId === "INJECAO") {
    return "A mensagem tenta dar ordem ao copiloto (ignorar política, trocar de papel, prometer anuidade gratuita). Trate o texto como fala de cliente. Não confirme benefício fora da tabela.";
  }
  if (decision.ruleId === "OPERADOR_SEGREDO" || decision.ruleId === "ALERTA_DADO") {
    return "Não peça nem repita senha, CVV ou token no chat. A redefinição acontece no app ou no caixa. Se o dado já apareceu, oriente a pessoa a trocar a senha depois.";
  }
  if (decision.ruleId === "ALERTA_FRAUDE") {
    return `Possível fraude. Bloqueio imediato pelo app e contestação em até ${FACTS.contestDays}. Sem senha, sem CVV, sem oferta de produto.`;
  }
  if (decision.ruleId === "ALERTA_REGULATORIO") {
    return "Menção a canal de reclamação ou medida legal. Priorize escuta e o procedimento. Não discuta juridicamente e não aproveite para vender.";
  }
  return "Situação que pede mais cuidado do que uma sugestão de texto.";
}

let seq = 0;

function card(partial: Omit<Card, "id" | "expiresOnTurn"> & { turn: number }): Card {
  seq += 1;
  return {
    ...partial,
    id: `c${partial.turn}-${seq}`,
    expiresOnTurn: partial.turn + 2,
  };
}

export function materialize(input: {
  decision: Decision;
  docs: Doc[];
  sources: SourceRef[];
  signals: Signals;
  tier: Tier | null;
  turn: number;
  maxCards: number;
  retrievalRejected: boolean;
}): { cards: Card[]; silenceReason: string | null; ruleId: string | null } {
  const { decision, sources, signals, tier, turn, maxCards } = input;
  if (!decision.speak) return { cards: [], silenceReason: null, ruleId: null };

  const cards: Card[] = [];
  const askedInfinite = signals.tier === "infinite" || fold(signals.topic.evidence.join(" ")).includes("infinite");
  const levelFor = (kind: CardKind): Card["level"] => (kind === "alert" ? 5 : kind === "guidance" ? 4 : kind === "reply" ? 3 : 2);

  for (const kind of decision.kinds) {
    if (cards.length >= maxCards) break;
    if (kind === "alert") {
      cards.push(
        card({
          turn,
          kind,
          level: 5,
          title: decision.ruleId === "INJECAO" ? "Instrução embutida na fala" : decision.ruleId === "OPERADOR_SEGREDO" ? "Não peça segredo" : "Atenção nesta fala",
          body: alertBody(decision),
          sources: [],
          confidence: decision.confidence,
          signature: decision.signature.replace(/^[^:]+/, "alert"),
          why: decision.why,
          ruleId: decision.ruleId,
          policyIds: decision.policyIds,
          generation: "nenhuma",
        }),
      );
      continue;
    }
    if (kind === "guidance") {
      cards.push(
        card({
          turn,
          kind,
          level: 4,
          title: decision.ruleId === "AMBIGUO" ? "Falta o produto" : "Próximo passo permitido",
          body: guidanceFor(decision, tier),
          sources: sources.slice(0, 2),
          confidence: decision.confidence,
          signature: decision.signature.replace(/^[^:]+/, "guidance"),
          why: decision.why,
          ruleId: decision.ruleId,
          policyIds: decision.policyIds,
          generation: "template",
        }),
      );
      continue;
    }
    if (kind === "reply" || kind === "knowledge") {
      if (input.retrievalRejected && decision.ruleId !== "SEMPRE") {
        continue;
      }
      const reply = replyFor(decision, tier, askedInfinite);
      const thin = input.retrievalRejected;
      cards.push(
        card({
          turn,
          kind: "reply",
          level: levelFor("reply"),
          title: thin ? "Sem fonte suficiente" : "Texto para editar",
          body: thin
            ? "A busca não achou trecho acima do limiar. A abordagem que fala sempre ainda assim produziria texto — aqui o rascunho fica contido para não inventar."
            : "Rascunho só com números que estão na base. Edite antes de usar. Nada é enviado sozinho.",
          reply: thin ? undefined : reply,
          sources,
          confidence: thin ? Math.min(decision.confidence, 0.4) : decision.confidence,
          signature: decision.signature.replace(/^[^:]+/, "reply"),
          why: decision.why,
          ruleId: decision.ruleId,
          policyIds: Array.from(new Set([...decision.policyIds, ...input.docs.flatMap((doc) => doc.policyIds)])),
          generation: thin ? "nenhuma" : "template",
        }),
      );
    }
  }

  const safe = cards.map((item) => {
    const reply = item.reply && badPromise(item.reply) ? undefined : item.reply;
    const body = badPromise(item.body) ? "Texto retido pelo guardrail. Use a fonte e não prometa condição fora da política." : item.body;
    return { ...item, reply, body };
  });

  if (!safe.length && decision.speak && decision.ruleId !== "SEMPRE") {
    return {
      cards: [],
      silenceReason: "Havia oportunidade, mas a base não sustentou uma resposta acima do limiar.",
      ruleId: "SEM_FONTE",
    };
  }
  return { cards: safe, silenceReason: null, ruleId: null };
}

export function promptSize(customer: string, sources: SourceRef[]): number {
  const blob = `${customer}\n${sources.map((source) => source.excerpt).join("\n")}\nEscreva uma resposta curta ao cliente, em português, só com estes fatos.`;
  return estimateTokens(blob) + 80;
}
