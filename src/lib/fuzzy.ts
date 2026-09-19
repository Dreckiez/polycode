/** Sequential fuzzy match — all query characters in order, with bonuses
 *  for consecutive runs, path separators, and camelCase boundaries. */

export type FuzzyHit = {
  score: number;
  positions: number[];
};

export type PreparedFuzzyQuery = {
  raw: string;
  tokens: { raw: string; lower: string }[];
};

export function prepareFuzzyQuery(query: string): PreparedFuzzyQuery {
  const raw = query.trim();
  const tokens = raw
    ? raw
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => ({ raw: t, lower: t.toLowerCase() }))
    : [];
  return { raw, tokens };
}

export function fuzzyMatch(
  query: string | PreparedFuzzyQuery,
  text: string,
): FuzzyHit | null {
  const prepared = typeof query === "string" ? prepareFuzzyQuery(query) : query;
  if (prepared.tokens.length === 0) return { score: 0, positions: [] };
  if (prepared.tokens.length === 1) {
    return matchTokenPrepared(prepared.tokens[0], text);
  }

  const positions: number[] = [];
  let score = 0;
  for (const token of prepared.tokens) {
    const hit = matchTokenPrepared(token, text);
    if (!hit) return null;
    score += hit.score;
    for (const index of hit.positions) positions.push(index);
  }
  positions.sort((a, b) => a - b);
  return { score, positions };
}

function matchTokenPrepared(
  token: { raw: string; lower: string },
  text: string,
): FuzzyHit | null {
  const needle = token.lower;
  if (!needle) return { score: 0, positions: [] };

  const hay = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let consecutive = 0;
  let qi = 0;

  for (let i = 0; i < hay.length && qi < needle.length; i++) {
    if (hay[i] !== needle[qi]) {
      consecutive = 0;
      continue;
    }
    positions.push(i);
    consecutive += 1;
    score += 1 + consecutive * 4;
    if (i === 0 || isBreak(text[i - 1])) score += 14;
    else if (isUpper(text[i]) && !isUpper(text[i - 1])) score += 10;
    qi += 1;
  }

  if (qi !== needle.length) return null;
  score -= hay.length - needle.length;
  return { score, positions };
}

function isBreak(ch: string): boolean {
  return ch === "/" || ch === "\\" || ch === "-" || ch === "_" || ch === "." || ch === " ";
}

function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

/** Prefer filename hits over directory-only hits. Positions index `relative`. */
export function scorePath(
  query: string | PreparedFuzzyQuery,
  relative: string,
  name: string,
): FuzzyHit | null {
  const prepared = typeof query === "string" ? prepareFuzzyQuery(query) : query;
  if (prepared.tokens.length === 0) return { score: 0, positions: [] };

  const offset = Math.max(0, relative.length - name.length);
  const nameHit = fuzzyMatch(prepared, name);
  if (nameHit) {
    return {
      score: nameHit.score + 400,
      positions: nameHit.positions.map((index) => index + offset),
    };
  }

  return fuzzyMatch(prepared, relative);
}
