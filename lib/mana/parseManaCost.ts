/**
 * Parses Scryfall-style mana cost strings into symbol tokens.
 * Example: "{2}{G}{G}" -> ["2", "G", "G"]
 */
export function parseManaCost(manaCost?: string | null): string[] {
  if (!manaCost) {
    return [];
  }

  const tokens: string[] = [];
  const pattern = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null = pattern.exec(manaCost);

  while (match) {
    const symbol = match[1]?.trim();
    if (symbol) {
      tokens.push(symbol);
    }

    match = pattern.exec(manaCost);
  }

  return tokens;
}
