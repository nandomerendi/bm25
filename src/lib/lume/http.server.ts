import { evaluateAll } from "./eval.ts";
import { composeReply, modelConfigured } from "./llm.server.ts";
import { runTurn } from "./pipeline.ts";
import { DEFAULT_THRESHOLDS, type Approach, type InteractionState, type Posture, type Role, type Thresholds } from "./types.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function clampState(value: unknown): InteractionState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as InteractionState;
  if (typeof state.turn !== "number" || !state.sentiment) return null;
  return {
    ...state,
    covered: Array.isArray(state.covered) ? state.covered.slice(-12) : [],
    interventions: Array.isArray(state.interventions) ? state.interventions.slice(-20) : [],
    riskFlags: Array.isArray(state.riskFlags) ? state.riskFlags.slice(-8) : [],
    sentiment: {
      label: state.sentiment.label ?? "neutro",
      score: Number(state.sentiment.score) || 0,
      trend: state.sentiment.trend ?? "estavel",
      history: Array.isArray(state.sentiment.history) ? state.sentiment.history.slice(-12) : [],
    },
  };
}

function approachOf(value: unknown): Approach {
  return value === "A" || value === "B" || value === "C" ? value : "C";
}

function thresholdsOf(value: unknown): Partial<Thresholds> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Partial<Thresholds>;
  const next: Partial<Thresholds> = {};
  if (typeof raw.minConfidence === "number") next.minConfidence = Math.min(0.9, Math.max(0.2, raw.minConfidence));
  if (typeof raw.minRetrieval === "number") next.minRetrieval = Math.min(30, Math.max(0, raw.minRetrieval));
  if (typeof raw.cooldownTurns === "number") next.cooldownTurns = Math.min(8, Math.max(0, Math.round(raw.cooldownTurns)));
  if (typeof raw.maxCards === "number") next.maxCards = Math.min(3, Math.max(1, Math.round(raw.maxCards)));
  return next;
}

export async function handleLume(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return json({ model: modelConfigured(), thresholds: DEFAULT_THRESHOLDS });
  }
  if (request.method !== "POST") return json({ error: "método não suportado" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  if (body.op === "eval") return json({ reports: evaluateAll() });

  if (body.op === "compose") {
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const cleanSources = sources
      .slice(0, 3)
      .map((source) => {
        const item = source as { title?: unknown; excerpt?: unknown };
        return { title: String(item.title ?? "Fonte"), excerpt: String(item.excerpt ?? "").slice(0, 500) };
      });
    const result = await composeReply({
      customerText: String(body.customerText ?? "").slice(0, 1200),
      draft: String(body.draft ?? "").slice(0, 400),
      sources: cleanSources,
    });
    return json(result, result.ok ? 200 : 200);
  }

  const text = String(body.text ?? "").trim();
  if (!text) return json({ error: "fala vazia" }, 400);
  const role: Role = body.role === "operator" ? "operator" : "customer";
  const posture: Posture = body.posture === "reactive" ? "reactive" : "proactive";
  const result = runTurn({
    text,
    role,
    state: clampState(body.state),
    approach: approachOf(body.approach),
    posture,
    thresholds: thresholdsOf(body.thresholds),
    suppression: body.suppression !== false,
  });
  return json(result);
}
