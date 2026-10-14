const STOP = new Set(
  `a o os as de do da dos das e em no na nos nas num numa uns umas que para com por se ao aos à as um uma ou como mais mas ja já nao não sim eu voce você vc me te meu minha meus minhas isso isto aqui ali la lá ele ela eles elas ser ter foi sao são está esta esse essa esses essas um por na ao lhe lhes dos das pelo pela seu sua seus suas muito tambem também já aos umha`.split(
    /\s+/,
  ),
);

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

export function hasPhrase(folded: string, phrase: string): boolean {
  const needle = fold(phrase);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(folded);
}

export function clip(value: string, max = 300): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const last = cut.lastIndexOf(" ");
  return `${(last > 180 ? cut.slice(0, last) : cut).trim()}…`;
}

export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
