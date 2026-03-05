/**
 * Source: WotC Commander Brackets "Game Changers" image update.
 * Version is pinned so list updates are explicit in code review.
 */
export const GAME_CHANGERS_VERSION = "2026-02-09";

// Keep names in canonical card form; matching is performed case-insensitively.
export const GAME_CHANGERS = new Set<string>([
  // White
  "Drannith Magistrate",
  "Enlightened Tutor",
  "Farewell",
  "Humility",
  "Serra's Sanctum",
  "Smothering Tithe",
  "Teferi's Protection",
  // Blue
  "Consecrated Sphinx",
  "Cyclonic Rift",
  "Force of Will",
  "Fierce Guardianship",
  "Gifts Ungiven",
  "Intuition",
  "Mystical Tutor",
  "Narset, Parter of Veils",
  "Rhystic Study",
  "Thassa's Oracle",
  // Black
  "Ad Nauseam",
  "Bolas's Citadel",
  "Braids, Cabal Minion",
  "Demonic Tutor",
  "Imperial Seal",
  "Necropotence",
  "Opposition Agent",
  "Orcish Bowmasters",
  "Tergrid, God of Fright",
  "Vampiric Tutor",
  // Red
  "Gamble",
  "Jeska's Will",
  "Underworld Breach",
  // Green
  "Biorhythm",
  "Crop Rotation",
  "Gaea's Cradle",
  "Natural Order",
  "Seedborn Muse",
  "Survival of the Fittest",
  "Worldly Tutor",
  // Multicolor
  "Aura Shards",
  "Coalition Victory",
  "Grand Arbiter Augustin IV",
  "Notion Thief",
  // Colorless
  "Ancient Tomb",
  "Chrome Mox",
  "Field of the Dead",
  "Glacial Chasm",
  "Grim Monolith",
  "Lion's Eye Diamond",
  "Mana Vault",
  "Mishra's Workshop",
  "Mox Diamond",
  "Panoptic Mirror",
  "The One Ring",
  "The Tabernacle at Pendrell Vale"
]);

/**
 * Normalizes names for punctuation-tolerant matching (apostrophes, accents, spacing).
 */
export function normalizeGameChangerName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const GAME_CHANGER_LOOKUP = new Map<string, string>(
  [...GAME_CHANGERS].map((name) => [normalizeGameChangerName(name), name])
);

/**
 * Returns canonical Game Changer name if matched; otherwise null.
 */
export function findGameChangerName(name: string): string | null {
  return GAME_CHANGER_LOOKUP.get(normalizeGameChangerName(name)) ?? null;
}

export function isGameChangerName(name: string): boolean {
  return findGameChangerName(name) !== null;
}
