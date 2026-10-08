/**
 * Lightweight fuzzy matcher for the Command Palette (and, later, Global
 * Search's file-name matching in Part 5, which reuses this same module).
 *
 * Algorithm: subsequence match (every character of the query must appear
 * in the target, in order, but not necessarily contiguous — the same
 * model VS Code's palette uses) with a score that rewards:
 *   - contiguous runs of matched characters
 *   - matches at the start of the string or right after a word boundary
 *     (space, -, _, /, capital letter) — so "gtl" ranks "Go to Line"
 *     above some unrelated string that merely contains g...t...l in order
 *
 * Returns null for no match, or { score, matchedIndices } for a match,
 * so callers can both rank results and highlight matched characters.
 */
export function fuzzyMatch(query, target) {
  if (!query) return { score: 0, matchedIndices: [] };
  if (!target) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;
  const matchedIndices = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matchedIndices.push(ti);

      let charScore = 1;
      // Reward contiguous matches.
      if (lastMatchIndex === ti - 1) charScore += 3;
      // Reward matches at a word boundary (start of string, or right
      // after space/-/_//, or a case transition indicating a new word
      // in camelCase/PascalCase targets).
      const prevChar = target[ti - 1];
      const isBoundary =
        ti === 0 ||
        prevChar === ' ' ||
        prevChar === '-' ||
        prevChar === '_' ||
        prevChar === '/' ||
        prevChar === '.' ||
        (prevChar && prevChar === prevChar.toLowerCase() && target[ti] === target[ti].toUpperCase() && target[ti] !== target[ti].toLowerCase());
      if (isBoundary) charScore += 5;

      score += charScore;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi < q.length) return null; // not all query characters were found in order

  // Shorter targets that match the same query rank slightly higher
  // (prefers "Save" over "Save All Files" for query "save" when both
  // match equally well otherwise).
  score += Math.max(0, 20 - target.length) * 0.1;

  return { score, matchedIndices };
}

/**
 * Filters + ranks a list of items by fuzzy-matching `query` against a
 * caller-provided text extractor, returning items sorted best-match-first
 * with their match metadata attached. Empty query returns all items
 * unscored, in original order — used by the Command Palette's initial
 * "recently used" / full list view before the user types anything.
 */
export function fuzzySearch(query, items, getText) {
  if (!query) {
    return items.map((item) => ({ item, score: 0, matchedIndices: [] }));
  }

  const results = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getText(item));
    if (match) {
      results.push({ item, score: match.score, matchedIndices: match.matchedIndices });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
