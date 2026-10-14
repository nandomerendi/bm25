import { Bm25 } from "./bm25.ts";
import { DOCS, docById, type Doc } from "./knowledge.ts";
import type { RetrievalDebug, SourceRef } from "./types.ts";

const BODY = new Bm25(DOCS.map((doc) => ({ id: doc.id, text: `${doc.section}. ${doc.text}` })));
const TITLE = new Bm25(DOCS.map((doc) => ({ id: doc.id, text: `${doc.title} ${doc.tags.join(" ")}` })));

const EXPANSION: Record<string, string> = {
  anuidade: "anuidade tabela valor anual classic gold infinite",
  isencao: "isencao isentar gasto media fatura alçada retencao",
  cancelamento: "cancelar cancelamento restituicao multa",
  fraude: "fraude bloqueio contestacao compra nao reconhecida clonado",
  fatura: "fatura fechamento vencimento parcelamento rotativo",
  limite: "limite aumento analise credito",
  cashback: "cashback compras elegiveis",
  viagem: "viagem sala vip lounge loungekey infinite",
  senha: "senha aplicativo cvv token redefinir",
  cartao: "cartao anuidade",
  gold: "gold anuidade",
  infinite: "infinite lounge",
  classic: "classic anuidade",
  informacao: "",
  objecao_preco: "anuidade cara valor",
  negociacao: "isencao alçada retencao doze meses",
  comercial: "beneficio sala vip",
};

export interface Retrieved {
  debug: RetrievalDebug;
  sources: SourceRef[];
  docs: Doc[];
}

export function retrieve(query: string, hints: string[], minScore: number): Retrieved {
  const expansion = hints.map((hint) => EXPANSION[hint] ?? "").filter(Boolean).join(" ");
  const expanded = `${query} ${expansion}`.trim();
  const lexical = BODY.search(query, 8);
  const body = BODY.search(expanded, 8);
  const title = TITLE.search(expanded, 8);
  const titleScore = new Map(title.map((hit) => [hit.id, hit.score]));
  const lexicalScore = new Map(lexical.map((hit) => [hit.id, hit.score]));

  const hybrid = body
    .map((hit) => {
      const doc = docById(hit.id);
      if (!doc) return null;
      const tagHit = doc.tags.some((tag) => hints.includes(tag));
      const score = Math.round((hit.score * (tagHit ? 1.25 : 1) + (titleScore.get(hit.id) ?? 0) * 1.6) * 100) / 100;
      return { doc, score };
    })
    .filter((hit): hit is { doc: Doc; score: number } => Boolean(hit))
    .sort((a, b) => b.score - a.score);

  const best = hybrid[0]?.score ?? 0;
  const kept = hybrid.filter((hit) => hit.score >= minScore && hit.score >= best * 0.55).slice(0, 3);
  const rejected = kept.length === 0;

  return {
    docs: kept.map((hit) => hit.doc),
    sources: kept.map((hit) => ({
      docId: hit.doc.id,
      title: hit.doc.title,
      section: hit.doc.section,
      excerpt: hit.doc.text.length > 280 ? `${hit.doc.text.slice(0, 277).trim()}…` : hit.doc.text,
      score: hit.score,
    })),
    debug: {
      strategy: "hibrido-bm25-tags",
      lexicalTop: lexical.slice(0, 4).map((hit) => ({
        id: hit.id,
        title: docById(hit.id)?.title ?? hit.id,
        score: Math.round((lexicalScore.get(hit.id) ?? 0) * 100) / 100,
      })),
      hybridTop: hybrid.slice(0, 4).map((hit) => ({
        id: hit.doc.id,
        title: hit.doc.title,
        score: hit.score,
        tags: hit.doc.tags,
      })),
      used: kept.map((hit) => hit.doc.id),
      rejected,
    },
  };
}
