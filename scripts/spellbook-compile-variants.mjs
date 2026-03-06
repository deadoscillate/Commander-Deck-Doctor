import fs from "node:fs";
import path from "node:path";

const IN_PATH = path.resolve("data/spellbook/variants.raw.json");
const OUT_PATH = path.resolve("lib/combos.json");
const SOURCE_TAG = "commander-spellbook";
const ZONE_LABELS = {
  B: "battlefield",
  C: "command zone",
  E: "exile",
  G: "graveyard",
  H: "hand",
  L: "library"
};

function normalizeCardName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeComboName(cards, variantId) {
  if (cards.length <= 3) {
    return cards.join(" + ");
  }

  const shown = cards.slice(0, 3).join(" + ");
  return `${shown} + ${cards.length - 3} more [${variantId}]`;
}

function summarizeRequirement(rawRequirement) {
  if (!rawRequirement || typeof rawRequirement !== "object") {
    return null;
  }

  const quantity =
    typeof rawRequirement.quantity === "number" && Number.isFinite(rawRequirement.quantity)
      ? Math.max(1, Math.floor(rawRequirement.quantity))
      : 1;
  const templateName = normalizeCardName(rawRequirement.template?.name);
  if (!templateName) {
    return null;
  }

  const zoneLabels = Array.isArray(rawRequirement.zoneLocations)
    ? rawRequirement.zoneLocations
        .map((zone) => ZONE_LABELS[zone] ?? null)
        .filter((zone) => typeof zone === "string")
    : [];
  const zoneText = zoneLabels.length > 0 ? ` in ${zoneLabels.join(" / ")}` : "";
  const commanderText = rawRequirement.mustBeCommander ? " (must be commander)" : "";
  return `${quantity}x ${templateName}${zoneText}${commanderText}`;
}

function normalizeSpellbookVariant(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const variant = raw;
  const variantId = typeof variant.id === "string" ? variant.id.trim() : "";
  if (!variantId) {
    return null;
  }

  if (variant.status !== "OK") {
    return null;
  }

  const commanderLegal = Boolean(variant.legalities?.commander);
  if (!commanderLegal) {
    return null;
  }

  const requires = Array.isArray(variant.requires) ? variant.requires : [];
  const normalizedRequires = requires
    .map((requirement) => summarizeRequirement(requirement))
    .filter((requirement) => typeof requirement === "string" && requirement.length > 0);

  const uses = Array.isArray(variant.uses) ? variant.uses : [];
  const cardNames = [];
  const seen = new Set();
  for (const use of uses) {
    const name = normalizeCardName(use?.card?.name);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cardNames.push(name);
  }

  if (cardNames.length < 2) {
    return null;
  }

  return {
    combo_name: summarizeComboName(cardNames, variantId),
    cards: cardNames,
    requires: normalizedRequires,
    conditional: normalizedRequires.length > 0,
    source: SOURCE_TAG,
    spellbook_variant_id: variantId,
    commander_spellbook_url: `https://commanderspellbook.com/combo/${encodeURIComponent(variantId)}/`
  };
}

function dedupeCombos(rows) {
  const bySignature = new Map();

  for (const row of rows) {
    const cardSignature = row.cards
      .map((card) => card.toLowerCase())
      .sort((a, b) => a.localeCompare(b))
      .join("|");
    const requirementSignature = (Array.isArray(row.requires) ? row.requires : [])
      .map((requirement) => requirement.toLowerCase())
      .sort((a, b) => a.localeCompare(b))
      .join("|");
    const signature = `${cardSignature}||${requirementSignature}`;

    if (!signature) {
      continue;
    }

    if (!bySignature.has(signature)) {
      bySignature.set(signature, row);
    }
  }

  return [...bySignature.values()];
}

function main() {
  if (!fs.existsSync(IN_PATH)) {
    throw new Error(`Missing Spellbook raw data: ${IN_PATH}\nRun: npm run spellbook:download`);
  }

  const raw = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Unexpected Spellbook raw format: expected array.");
  }

  const normalized = raw.map(normalizeSpellbookVariant).filter(Boolean);
  const deduped = dedupeCombos(normalized).sort((a, b) => a.combo_name.localeCompare(b.combo_name));

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(deduped, null, 2)}\n`, "utf8");
  console.log(`Compiled ${deduped.length} Commander Spellbook combos to: ${OUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

