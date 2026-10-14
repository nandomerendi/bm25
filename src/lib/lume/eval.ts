import { runTurn } from "./pipeline.ts";
import { SCENARIOS, type ScenarioTurn } from "./scenarios.ts";
import type { Approach, InteractionState, TurnResult } from "./types.ts";

export interface ModeSpec {
  id: string;
  label: string;
  approach: Approach;
  stateless?: boolean;
  suppression?: boolean;
}

export const MODES: ModeSpec[] = [
  { id: "A", label: "A · LLM em toda fala", approach: "A" },
  { id: "B", label: "B · classificar e falar", approach: "B" },
  { id: "C", label: "C · estado e oportunidade", approach: "C" },
  { id: "C-estado", label: "C sem estado", approach: "C", stateless: true },
  { id: "C-supressao", label: "C sem supressão", approach: "C", suppression: false },
];

export interface Failure {
  scenario: string;
  turn: number;
  text: string;
  detail: string;
}

export interface ModeReport {
  id: string;
  label: string;
  turns: number;
  goldInterventions: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  unnecessaryRate: number;
  cards: number;
  silences: number;
  policyLlmCalls: number;
  actualLlmCalls: number;
  promptTokens: number;
  latency: { p50: number; p95: number; p99: number; mean: number; max: number };
  failures: Failure[];
}

function ratio(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 1000;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function judge(turn: ScenarioTurn, result: TurnResult): { tp: boolean; fp: boolean; fn: boolean; detail: string } {
  const expect = turn.expect;
  const kinds = result.cards.map((card) => card.kind);
  const emitted = kinds.length > 0;
  const kindOk = !expect.kinds || expect.kinds.some((kind) => kinds.includes(kind));
  const forbidden = (expect.notKinds ?? []).some((kind) => kinds.includes(kind));
  const tp = expect.intervene && emitted && kindOk && !forbidden;
  const fp = emitted && (!expect.intervene || !kindOk || forbidden);
  const fn = expect.intervene && (!emitted || !kindOk || forbidden);
  const detail = tp
    ? "ok"
    : `${expect.intervene ? "esperava intervenção" : "esperava silêncio"} · veio ${emitted ? kinds.join("+") : result.silence?.ruleId ?? "silêncio"} · ${result.audit.ruleId}`;
  return { tp, fp, fn, detail };
}

export function evaluateMode(mode: ModeSpec): ModeReport {
  const failures: Failure[] = [];
  const latencies: number[] = [];
  let turns = 0;
  let gold = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let cards = 0;
  let silences = 0;
  let policyLlmCalls = 0;
  let promptTokens = 0;

  for (const scenario of SCENARIOS) {
    let state: InteractionState | null = null;
    scenario.turns.forEach((turn, index) => {
      const result = runTurn({
        text: turn.text,
        role: turn.role,
        state: mode.stateless ? null : state,
        approach: mode.approach,
        posture: "proactive",
        suppression: mode.suppression,
        stateless: mode.stateless,
      });
      state = mode.stateless ? null : result.state;
      turns += 1;
      if (turn.expect.intervene) gold += 1;
      cards += result.cards.length;
      if (!result.cards.length) silences += 1;
      policyLlmCalls += result.tokens.policyLlmCalls;
      promptTokens += result.tokens.promptTokens;
      latencies.push(result.totalMs);
      const verdict = judge(turn, result);
      if (verdict.tp) tp += 1;
      if (verdict.fp) fp += 1;
      if (verdict.fn) fn += 1;
      if (!verdict.tp && (verdict.fp || verdict.fn)) {
        failures.push({ scenario: scenario.id, turn: index + 1, text: turn.text, detail: verdict.detail });
      }
    });
  }

  const mean = latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length);
  return {
    id: mode.id,
    label: mode.label,
    turns,
    goldInterventions: gold,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    unnecessaryRate: ratio(fp, turns),
    cards,
    silences,
    policyLlmCalls,
    actualLlmCalls: 0,
    promptTokens,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      mean: Math.round(mean * 100) / 100,
      max: Math.max(...latencies),
    },
    failures,
  };
}

export function evaluateAll(): ModeReport[] {
  return MODES.map(evaluateMode);
}
