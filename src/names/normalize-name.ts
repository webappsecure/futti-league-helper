const VALID_NAME = /^[A-Z][A-Z '-]*$/;

/**
 * Uppercase A-Z with spaces, apostrophes and hyphens kept; accents stripped, L-stroke and O-stroke
 * mapped to L and O, AE ligature to AE, periods and trailing apostrophes removed, the curly apostrophe turned straight.
 * Returns null when nothing valid remains.
 */
export function normalizeName(raw: string): string | null {
  const name = raw
    .replace(/[Łł]/g, 'L')
    .replace(/[Øø]/g, 'O')
    .replace(/[Ææ]/g, 'AE')
    .replace(/\./g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[\s']+$/, '')
    .trim();
  return VALID_NAME.test(name) ? name : null;
}

export interface NamePool {
  names: string[];
  /** Original text of each non-blank line that could not be normalized. */
  invalid: string[];
  duplicatesRemoved: number;
  linesRead: number;
}

/** Normalizes every line, then removes duplicates, so spellings that collapse together count once. */
export function buildNamePool(lines: readonly string[]): NamePool {
  const unique = new Set<string>();
  const invalid: string[] = [];
  let duplicatesRemoved = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const name = normalizeName(line);
    if (name === null) invalid.push(line);
    else if (unique.has(name)) duplicatesRemoved += 1;
    else unique.add(name);
  }
  const names = [...unique].sort();
  return { names, invalid, duplicatesRemoved, linesRead: lines.length };
}
