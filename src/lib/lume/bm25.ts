import { tokens } from "./text.ts";

interface BuiltDoc {
  id: string;
  terms: string[];
  tf: Map<string, number>;
  length: number;
}

export interface Hit {
  id: string;
  score: number;
}

/** Okapi BM25 over a small in-memory corpus. No network, no model. */
export class Bm25 {
  private readonly docs: BuiltDoc[];
  private readonly df = new Map<string, number>();
  private readonly avg: number;
  private readonly k1: number;
  private readonly b: number;

  constructor(docs: { id: string; text: string }[], k1 = 1.2, b = 0.25) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map((doc) => {
      const terms = tokens(doc.text);
      const tf = new Map<string, number>();
      for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
      return { id: doc.id, terms, tf, length: terms.length || 1 };
    });
    for (const doc of this.docs) {
      for (const term of doc.tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    const total = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.avg = total / Math.max(1, this.docs.length);
  }

  search(query: string, k = 5): Hit[] {
    const qtf = new Map<string, number>();
    for (const term of tokens(query)) qtf.set(term, (qtf.get(term) ?? 0) + 1);
    const n = this.docs.length;
    const scored = this.docs.map((doc) => {
      let score = 0;
      for (const term of qtf.keys()) {
        const freq = doc.tf.get(term) ?? 0;
        if (!freq) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const denom = freq + this.k1 * (1 - this.b + this.b * (doc.length / this.avg));
        score += idf * ((freq * (this.k1 + 1)) / denom);
      }
      return { id: doc.id, score };
    });
    return scored
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
