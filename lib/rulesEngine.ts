import { buildColorIdentityCheck, buildDeckChecks } from "./checks";
import { evaluateCommanderConfiguration } from "./commanderConfiguration";
import type { RulesEngineReport, RulesEngineRuleResult } from "./contracts";
import type { DeckCard, ParsedDeckEntry, ScryfallCard } from "./types";
import banlistDataset from "./rules/datasets/banlist.json";
import officialRulesDataset from "./rules/datasets/officialRules.json";

const RULES_ENGINE_VERSION = `2026.03.07-official-${banlistDataset.versionDate}`;

type CommanderSelection = {
  name: string | null;
  names?: string[];
  colorIdentity: string[];
  resolved: boolean;
  card?: ScryfallCard | null;
  cards?: ScryfallCard[];
};

type CompanionSelection = {
  name: string | null;
  entries?: ParsedDeckEntry[];
  resolved: boolean;
  card?: ScryfallCard | null;
};

export type CommanderRulesEngineInput = {
  parsedDeck: ParsedDeckEntry[];
  knownCards: DeckCard[];
  unknownCards: string[];
  commander: CommanderSelection;
  companion?: CompanionSelection | null;
};

function toNameCountList(names: string[]): Array<{ name: string; qty: number }> {
  return [...new Set(names)]
    .filter((name) => name.trim().length > 0)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, qty: 1 }));
}

function sortRules(a: RulesEngineRuleResult, b: RulesEngineRuleResult): number {
  const severityOrder = { ERROR: 0, WARN: 1, INFO: 2 };
  if (severityOrder[a.severity] !== severityOrder[b.severity]) {
    return severityOrder[a.severity] - severityOrder[b.severity];
  }

  if (a.outcome !== b.outcome) {
    const outcomeOrder = { FAIL: 0, SKIP: 1, PASS: 2 };
    return outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
  }

  return a.name.localeCompare(b.name);
}

function buildRule(rule: RulesEngineRuleResult): RulesEngineRuleResult {
  return rule;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildBanlistFindings(
  parsedDeck: ParsedDeckEntry[],
  commanderNames: string[],
  companionNames: string[] = []
): Array<{ name: string; qty: number }> {
  const bannedByNormalizedName = new Map(
    banlistDataset.bannedNames.map((name) => [normalizeName(name), name] as const)
  );
  const findingsByCardName = new Map<string, number>();

  for (const entry of parsedDeck) {
    const normalizedName = normalizeName(entry.name);
    const bannedName = bannedByNormalizedName.get(normalizedName);
    if (!bannedName) {
      continue;
    }

    findingsByCardName.set(bannedName, (findingsByCardName.get(bannedName) ?? 0) + entry.qty);
  }

  for (const commanderName of commanderNames) {
    const normalizedCommanderName = normalizeName(commanderName);
    const bannedCommanderName = bannedByNormalizedName.get(normalizedCommanderName);
    if (bannedCommanderName && !findingsByCardName.has(bannedCommanderName)) {
      findingsByCardName.set(bannedCommanderName, 1);
    }
  }

  for (const companionName of companionNames) {
    const normalizedCompanionName = normalizeName(companionName);
    const bannedCompanionName = bannedByNormalizedName.get(normalizedCompanionName);
    if (bannedCompanionName && !findingsByCardName.has(bannedCompanionName)) {
      findingsByCardName.set(bannedCompanionName, 1);
    }
  }

  return [...findingsByCardName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => ({ name, qty }));
}

function buildCategoryBanFindings(knownCards: DeckCard[]): Array<{ name: string; qty: number }> {
  const findingsByName = new Map<string, number>();

  for (const entry of knownCards) {
    const isConspiracy = /\bconspiracy\b/i.test(entry.card.type_line ?? "");
    const referencesAnte = /\bante\b/i.test(oracleText(entry.card));

    if (!isConspiracy && !referencesAnte) {
      continue;
    }

    findingsByName.set(entry.card.name, (findingsByName.get(entry.card.name) ?? 0) + entry.qty);
  }

  return [...findingsByName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => ({ name, qty }));
}

function oracleText(card: ScryfallCard): string {
  return [card.oracle_text, ...card.card_faces.map((face) => face.oracle_text ?? "")]
    .filter(Boolean)
    .join("\n");
}

function manaCosts(card: ScryfallCard): string[] {
  return [card.mana_cost, ...card.card_faces.map((face) => face.mana_cost ?? "")]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function manaSymbols(card: ScryfallCard): string[] {
  return manaCosts(card)
    .flatMap((cost) => [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? ""))
    .filter((symbol) => symbol.length > 0);
}

function cardTypes(card: ScryfallCard): Set<string> {
  return new Set(
    card.type_line
      .split(/[\u2014-]/)[0]
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function creatureSubtypes(card: ScryfallCard): Set<string> {
  const parts = card.type_line.split(/[\u2014-]/);
  if (parts.length < 2 || !/\bcreature\b/i.test(parts[0] ?? "")) {
    return new Set();
  }

  return new Set(
    (parts[1] ?? "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function isLand(card: ScryfallCard): boolean {
  return /\bland\b/i.test(card.type_line);
}

function isPermanent(card: ScryfallCard): boolean {
  return /\b(artifact|creature|enchantment|land|planeswalker|battle)\b/i.test(card.type_line);
}

function isCreature(card: ScryfallCard): boolean {
  return /\bcreature\b/i.test(card.type_line);
}

function hasActivatedAbility(card: ScryfallCard): boolean {
  return /(^|\n)[^(\n]*:\s*/m.test(oracleText(card));
}

function companionColorIdentityAllowed(companionCard: ScryfallCard, commanderColorIdentity: string[]): boolean {
  const allowed = new Set(commanderColorIdentity);
  return companionCard.color_identity.every((color) => allowed.has(color));
}

type CompanionValidationResult = {
  ok: boolean;
  reason: string;
};

function validateCompanionRule(companionCard: ScryfallCard, startingDeck: DeckCard[]): CompanionValidationResult {
  const startingCards = startingDeck.map((entry) => entry.card);
  switch (normalizeName(companionCard.name)) {
    case "lurrusofthedreamden": {
      const invalid = startingDeck.find((entry) => !isLand(entry.card) && isPermanent(entry.card) && entry.card.cmc > 2);
      return invalid
        ? { ok: false, reason: `Lurrus requires every permanent spell to have mana value 2 or less. ${invalid.card.name} has mana value ${invalid.card.cmc}.` }
        : { ok: true, reason: "Lurrus condition satisfied: all permanent spells have mana value 2 or less." };
    }
    case "yorionskynomad":
      return {
        ok: false,
        reason: "Yorion requires at least 20 cards above the minimum deck size, which Commander cannot satisfy with a fixed 100-card deck."
      };
    case "jeganthathewellspring": {
      const invalid = startingCards.find((card) => {
        const seen = new Set<string>();
        for (const symbol of manaSymbols(card)) {
          if (seen.has(symbol)) {
            return true;
          }
          seen.add(symbol);
        }
        return false;
      });
      return invalid
        ? { ok: false, reason: `Jegantha requires every mana cost to avoid repeated mana symbols. ${invalid.name} repeats a mana symbol in its mana cost.` }
        : { ok: true, reason: "Jegantha condition satisfied: no starting-deck card repeats a mana symbol in its mana cost." };
    }
    case "kaheeratheorphanguard": {
      const allowed = new Set(["Cat", "Elemental", "Nightmare", "Dinosaur", "Beast"]);
      const invalid = startingCards.find((card) => {
        if (!isCreature(card)) {
          return false;
        }
        const subtypes = creatureSubtypes(card);
        return subtypes.size === 0 || ![...subtypes].some((subtype) => allowed.has(subtype));
      });
      return invalid
        ? { ok: false, reason: `Kaheera requires every creature card to be a Cat, Elemental, Nightmare, Dinosaur, or Beast. ${invalid.name} does not qualify.` }
        : { ok: true, reason: "Kaheera condition satisfied: every creature card matches an allowed creature type." };
    }
    case "kerugathemacrosage": {
      const invalid = startingDeck.find((entry) => !isLand(entry.card) && entry.card.cmc < 3);
      return invalid
        ? { ok: false, reason: `Keruga requires every nonland card to have mana value 3 or greater. ${invalid.card.name} has mana value ${invalid.card.cmc}.` }
        : { ok: true, reason: "Keruga condition satisfied: every nonland card has mana value 3 or greater." };
    }
    case "zirdathedawnwaker": {
      const invalid = startingCards.find((card) => isPermanent(card) && !hasActivatedAbility(card));
      return invalid
        ? { ok: false, reason: `Zirda requires every permanent card to have an activated ability. ${invalid.name} does not show one in Oracle text.` }
        : { ok: true, reason: "Zirda condition satisfied: every permanent card shows an activated ability." };
    }
    case "gyrudadepthsofdredge": {
      const invalid = startingCards.find((card) => (card.cmc ?? 0) % 2 !== 0);
      return invalid
        ? { ok: false, reason: `Gyruda requires every card in the starting deck to have even mana value. ${invalid.name} has mana value ${invalid.cmc}.` }
        : { ok: true, reason: "Gyruda condition satisfied: every starting-deck card has even mana value." };
    }
    case "oboshthepreypiercer": {
      const invalid = startingDeck.find((entry) => !isLand(entry.card) && (entry.card.cmc ?? 0) % 2 === 0);
      return invalid
        ? { ok: false, reason: `Obosh requires every nonland card to have odd mana value. ${invalid.card.name} has mana value ${invalid.card.cmc}.` }
        : { ok: true, reason: "Obosh condition satisfied: every nonland card has odd mana value." };
    }
    case "lutritheSpellchaser":
      return {
        ok: true,
        reason: "Lutri's singleton condition is already enforced by Commander deck construction, but Commander banlist checks still apply."
      };
    case "umorithecollector": {
      const nonlandCards = startingCards.filter((card) => !isLand(card));
      const sharedTypes = nonlandCards.reduce<Set<string> | null>((current, card) => {
        const types = cardTypes(card);
        if (!current) {
          return new Set(types);
        }
        return new Set([...current].filter((type) => types.has(type)));
      }, null);
      return sharedTypes && sharedTypes.size > 0
        ? { ok: true, reason: `Umori condition satisfied: all nonland cards share the card type ${[...sharedTypes][0]}.` }
        : { ok: false, reason: "Umori requires every nonland card in the starting deck to share at least one card type." };
    }
    default:
      return {
        ok: false,
        reason: `${companionCard.name} is not a supported Commander companion for deterministic validation.`
      };
  }
}

function commanderExistsInDeck(parsedDeck: ParsedDeckEntry[], commanderName: string | null): boolean {
  if (!commanderName) {
    return false;
  }

  const normalizedCommander = normalizeName(commanderName);
  return parsedDeck.some((entry) => normalizeName(entry.name) === normalizedCommander);
}

/**
 * Evaluates Commander legality rules and returns structured findings.
 */
export function evaluateCommanderRules(input: CommanderRulesEngineInput): RulesEngineReport {
  const selectedCommanderName = input.commander.name;
  const selectedCommanderNames =
    Array.isArray(input.commander.names) && input.commander.names.length > 0
      ? input.commander.names
      : selectedCommanderName
        ? [selectedCommanderName]
        : [];
  const resolvedCommanderCard =
    input.commander.card ??
    (selectedCommanderName
      ? input.knownCards.find(
          (entry) => normalizeName(entry.card.name) === normalizeName(selectedCommanderName)
        )
          ?.card ?? null
      : null);
  const resolvedCommanderCards =
    Array.isArray(input.commander.cards) && input.commander.cards.length > 0
      ? input.commander.cards
      : resolvedCommanderCard
        ? [resolvedCommanderCard]
        : [];
  const commanderConfiguration = evaluateCommanderConfiguration(
    selectedCommanderNames,
    resolvedCommanderCards,
    input.commander.resolved
  );
  const checks = buildDeckChecks(input.parsedDeck, input.unknownCards, input.knownCards);
  const colorIdentityCheck = input.commander.name
    ? input.commander.resolved
      ? buildColorIdentityCheck(input.knownCards, input.commander.name, input.commander.colorIdentity)
      : {
          ok: false,
          enabled: false,
          commanderName: input.commander.name,
          commanderColorIdentity: [],
          offColorCount: 0,
          offColorCards: [],
          message: `Commander "${input.commander.name}" could not be resolved for color identity validation.`
        }
    : checks.colorIdentity;
  const selectedCompanionEntries = Array.isArray(input.companion?.entries)
    ? input.companion?.entries.filter((entry) => entry.name.trim().length > 0)
    : [];
  const selectedCompanionNames = selectedCompanionEntries.map((entry) => entry.name);
  const selectedCompanionName = input.companion?.name ?? selectedCompanionNames[0] ?? null;
  const resolvedCompanionCard = input.companion?.card ?? null;
  const declaredCompanionCopies = selectedCompanionEntries.reduce((sum, entry) => sum + entry.qty, 0);
  const companionRuleEvaluation = (() => {
    if (!selectedCompanionName) {
      return {
        outcome: "SKIP" as const,
        message: "No companion selected, so companion validation was skipped."
      };
    }

    if (selectedCompanionEntries.length !== 1 || declaredCompanionCopies !== 1) {
      return {
        outcome: "FAIL" as const,
        message: "Commander allows at most one companion card outside the 100-card deck."
      };
    }

    if (!input.companion?.resolved || !resolvedCompanionCard) {
      return {
        outcome: "FAIL" as const,
        message: `Companion "${selectedCompanionName}" could not be resolved for legality validation.`
      };
    }

    if (input.unknownCards.length > 0) {
      return {
        outcome: "SKIP" as const,
        message: "Unknown card names prevent full companion validation."
      };
    }

    if (!companionColorIdentityAllowed(resolvedCompanionCard, input.commander.colorIdentity)) {
      return {
        outcome: "FAIL" as const,
        message: `${resolvedCompanionCard.name} is outside the selected commander color identity.`
      };
    }

    const duplicateCopiesInDeck = input.parsedDeck.reduce((sum, entry) => {
      return normalizeName(entry.name) === normalizeName(resolvedCompanionCard.name) ? sum + entry.qty : sum;
    }, 0);
    if (duplicateCopiesInDeck > 0) {
      return {
        outcome: "FAIL" as const,
        message: `${resolvedCompanionCard.name} appears in the 100-card deck and cannot also be declared as the companion.`
      };
    }

    const validation = validateCompanionRule(resolvedCompanionCard, input.knownCards);
    return {
      outcome: validation.ok ? ("PASS" as const) : ("FAIL" as const),
      message: validation.reason
    };
  })();
  const banlistFindings = buildBanlistFindings(input.parsedDeck, selectedCommanderNames, selectedCompanionNames);
  const categoryBanFindings = buildCategoryBanFindings(input.knownCards);

  const rules: RulesEngineRuleResult[] = [
    buildRule({
      id: "commander.deck-size-exactly-100",
      name: "Deck Size Exactly 100",
      description: "Commander decks must contain exactly 100 cards including the commander.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: checks.deckSize.ok ? "PASS" : "FAIL",
      message: checks.deckSize.message,
      findings: [],
      remediation: checks.deckSize.ok
        ? undefined
        : ["Add or remove cards until the 100-card deck, including commander(s), totals exactly 100 cards."]
    }),
    buildRule({
      id: "commander.singleton-non-basic",
      name: "Singleton (Non-Basic)",
      description: "No non-basic card can appear more than once.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: checks.singleton.ok ? "PASS" : "FAIL",
      message: checks.singleton.message,
      findings: checks.singleton.duplicates,
      remediation: checks.singleton.ok
        ? undefined
        : [
            "Cut extra copies of non-basic cards unless that card's Oracle text explicitly overrides Commander singleton rules.",
            "If a duplicate is intentional, verify the exact card text allows that many copies."
          ]
    }),
    buildRule({
      id: "commander.banlist",
      name: "Commander Banlist",
      description:
        "Cards listed on the official Commander Rules Committee banned list are not legal in Commander deck construction.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: banlistFindings.length === 0 ? "PASS" : "FAIL",
      message:
        banlistFindings.length === 0
          ? `No banned cards detected against Commander RC banlist (${banlistDataset.versionDate}).`
          : `${banlistFindings.length} banned card${banlistFindings.length === 1 ? "" : "s"} detected against Commander RC banlist (${banlistDataset.versionDate}).`,
      findings: banlistFindings,
      remediation: banlistFindings.length === 0
        ? undefined
        : ["Replace each banned card in the deck, commander slot, or companion slot with a legal alternative."]
    }),
    buildRule({
      id: "commander.special-card-type-bans",
      name: "Special Card-Type Restrictions",
      description: "Commander decks cannot contain Conspiracy cards or cards that reference the ante mechanic.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: categoryBanFindings.length === 0 ? "PASS" : "FAIL",
      message:
        categoryBanFindings.length === 0
          ? "No Conspiracy or ante cards detected."
          : `${categoryBanFindings.length} card${categoryBanFindings.length === 1 ? "" : "s"} violate Commander's category-based restrictions.`,
      findings: categoryBanFindings,
      remediation: categoryBanFindings.length === 0
        ? undefined
        : [
            "Remove Conspiracy cards and cards that reference ante from the deck.",
            "These cards are banned by category even when they are not listed individually on the Commander banlist."
          ]
    }),
    buildRule({
      id: "commander.known-card-resolution",
      name: "Resolvable Card Names",
      description: "Unknown card names block full legality checks and should be corrected.",
      domain: "CARD_VALIDATION",
      severity: "WARN",
      outcome: checks.unknownCards.ok ? "PASS" : "FAIL",
      message: checks.unknownCards.message,
      findings: toNameCountList(checks.unknownCards.cards),
      remediation: checks.unknownCards.ok
        ? undefined
        : ["Correct unknown card names so legality, singleton exceptions, and color identity can be validated deterministically."]
    }),
    buildRule({
      id: "commander.commander-selected",
      name: "Commander Selected",
      description: "A commander is required to validate color identity and format intent.",
      domain: "COMMANDER_RULES",
      severity: "WARN",
      outcome: input.commander.name ? "PASS" : "FAIL",
      message: input.commander.name
        ? `Commander selected: ${selectedCommanderNames.join(" + ")}.`
        : "Commander not selected. Add a commander to unlock full rules validation.",
      findings: selectedCommanderNames.map((name) => ({ name, qty: 1 })),
      remediation: input.commander.name
        ? undefined
        : ["Choose the commander before analyzing so color identity and commander-specific legality can be validated."]
    }),
    buildRule({
      id: "commander.commander-present-in-deck",
      name: "Commander Present In Deck",
      description: "The selected commander should exist in the submitted decklist.",
      domain: "COMMANDER_RULES",
      severity: "ERROR",
      outcome: selectedCommanderNames.length > 0
        ? input.commander.resolved
          ? selectedCommanderNames.every((name) => commanderExistsInDeck(input.parsedDeck, name))
            ? "PASS"
            : "FAIL"
          : "SKIP"
        : "SKIP",
      message: selectedCommanderNames.length > 0
        ? input.commander.resolved
          ? selectedCommanderNames.every((name) => commanderExistsInDeck(input.parsedDeck, name))
            ? `Commander selection is present in the decklist: ${selectedCommanderNames.join(" + ")}.`
            : `One or more selected commanders are not present in the submitted decklist: ${selectedCommanderNames.join(" + ")}.`
          : `Commander selection could not be resolved for deck-presence validation: ${selectedCommanderNames.join(" + ")}.`
        : "No commander selected, so deck-presence validation was skipped.",
      findings: selectedCommanderNames.map((name) => ({ name, qty: 1 })),
      remediation:
        selectedCommanderNames.length > 0 &&
        input.commander.resolved &&
        !selectedCommanderNames.every((name) => commanderExistsInDeck(input.parsedDeck, name))
          ? ["Make sure the selected commander card is included in the submitted decklist or correct the commander selection."]
          : undefined
    }),
    buildRule({
      id: "commander.commander-eligible",
      name: "Commander Configuration",
      description:
        "The selected commander must be legal as a single commander, or the selected pair must form a legal two-commander configuration.",
      domain: "COMMANDER_RULES",
      severity: "ERROR",
      outcome: selectedCommanderNames.length > 0
        ? input.commander.resolved
          ? commanderConfiguration.ok
            ? "PASS"
            : "FAIL"
          : "SKIP"
        : "SKIP",
      message: selectedCommanderNames.length > 0
        ? input.commander.resolved
          ? commanderConfiguration.message
          : `Commander selection could not be resolved for configuration validation: ${selectedCommanderNames.join(" + ")}.`
        : "No commander selected, so commander eligibility validation was skipped.",
      findings: selectedCommanderNames.map((name) => ({ name, qty: 1 })),
      remediation:
        selectedCommanderNames.length > 0 && input.commander.resolved && !commanderConfiguration.ok
          ? [
              "Choose a single commander-eligible card or a legal paired configuration.",
              "For two-commanders, both cards must explicitly support the same Commander pairing rule."
            ]
          : undefined
    }),
    buildRule({
      id: "commander.companion-legality",
      name: "Companion Legality",
      description:
        "A declared companion must be a legal companion, fit the commander's color identity, and satisfy its own deck-building restriction.",
      domain: "COMMANDER_RULES",
      severity: "ERROR",
      outcome: companionRuleEvaluation.outcome,
      message: companionRuleEvaluation.message,
      findings: selectedCompanionNames.map((name) => ({ name, qty: 1 })),
      remediation:
        companionRuleEvaluation.outcome === "FAIL"
          ? [
              "Remove the companion or adjust the 100-card deck so it satisfies the companion's deck-building restriction.",
              "The companion must match commander color identity and remain outside the 100-card deck."
            ]
          : undefined
    }),
    buildRule({
      id: "commander.color-identity",
      name: "Color Identity Compliance",
      description: "All cards in the deck must fit the commander's color identity.",
      domain: "COMMANDER_RULES",
      severity: "ERROR",
      outcome: colorIdentityCheck.enabled ? (colorIdentityCheck.ok ? "PASS" : "FAIL") : "SKIP",
      message: colorIdentityCheck.message,
      findings: colorIdentityCheck.offColorCards.map((entry) => ({
        name: entry.name,
        qty: entry.qty
      })),
      remediation:
        colorIdentityCheck.enabled && !colorIdentityCheck.ok
          ? ["Replace or cut off-color cards so every card's color identity is a subset of the selected commander's color identity."]
          : undefined
    })
  ].sort(sortRules);

  const passedRules = rules.filter((rule) => rule.outcome === "PASS").length;
  const failedRules = rules.filter((rule) => rule.outcome === "FAIL").length;
  const skippedRules = rules.filter((rule) => rule.outcome === "SKIP").length;
  const blockingFailures = rules.filter((rule) => rule.outcome === "FAIL" && rule.severity === "ERROR").length;
  const warnings = rules
    .filter((rule) => rule.outcome === "FAIL" && rule.severity !== "ERROR")
    .map((rule) => `${rule.name}: ${rule.message}`);

  return {
    format: "commander",
    engineVersion: RULES_ENGINE_VERSION,
    status: blockingFailures > 0 ? "FAIL" : "PASS",
    passedRules,
    failedRules,
    skippedRules,
    rules,
    warnings,
    disclaimer:
      "Rules Engine uses official Commander rules + banlist sources (mtgcommander.net) and " +
      `Magic Comprehensive Rules metadata (effective ${officialRulesDataset.comprehensiveRules.effectiveDate ?? "unknown"}; revision ${officialRulesDataset.comprehensiveRules.revision ?? "unknown"}). ` +
      "Oracle-level gameplay rules and continuous effects are still out of scope for this pass."
  };
}
