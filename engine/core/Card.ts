import type { CardDefinition, ParsedTypeLine } from "./types";

const KNOWN_SUPERTYPES = new Set([
  "Basic",
  "Legendary",
  "Snow",
  "World",
  "Ongoing",
  "Elite",
  "Host"
]);

const KNOWN_TYPES = new Set([
  "Artifact",
  "Battle",
  "Creature",
  "Enchantment",
  "Instant",
  "Land",
  "Planeswalker",
  "Sorcery",
  "Tribal"
]);

export function parseTypeLine(typeLine: string): ParsedTypeLine {
  const [left, right] = typeLine.split("-", 2).map((chunk) => chunk.trim());
  const leftParts = (left ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const rightParts = (right ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const supertypes = leftParts.filter((part) => KNOWN_SUPERTYPES.has(part));
  const types = leftParts.filter((part) => KNOWN_TYPES.has(part));

  return {
    supertypes,
    types,
    subtypes: rightParts
  };
}

export function hasType(definition: CardDefinition, type: string): boolean {
  return definition.parsedTypeLine.types.includes(type);
}

export function hasSupertype(definition: CardDefinition, supertype: string): boolean {
  return definition.parsedTypeLine.supertypes.includes(supertype);
}

export function isCreature(definition: CardDefinition): boolean {
  return hasType(definition, "Creature");
}

export function isLegendary(definition: CardDefinition): boolean {
  return hasSupertype(definition, "Legendary");
}

export function isBasicLand(definition: CardDefinition): boolean {
  return hasType(definition, "Land") && hasSupertype(definition, "Basic");
}

export function isInstant(definition: CardDefinition): boolean {
  return hasType(definition, "Instant");
}

export function isSorcery(definition: CardDefinition): boolean {
  return hasType(definition, "Sorcery");
}

export function isLand(definition: CardDefinition): boolean {
  return hasType(definition, "Land");
}

export function isPermanent(definition: CardDefinition): boolean {
  return hasType(definition, "Artifact") ||
    hasType(definition, "Battle") ||
    hasType(definition, "Creature") ||
    hasType(definition, "Enchantment") ||
    hasType(definition, "Land") ||
    hasType(definition, "Planeswalker");
}
