import { buildColorIdentityCheck, buildDeckChecks } from "./checks";
import type { RulesEngineReport, RulesEngineRuleResult } from "./contracts";
import type { DeckCard, ParsedDeckEntry } from "./types";
import banlistDataset from "./rules/datasets/banlist.json";
import officialRulesDataset from "./rules/datasets/officialRules.json";

const RULES_ENGINE_VERSION = `2026.03.07-official-${banlistDataset.versionDate}`;

type CommanderSelection = {
  name: string | null;
  colorIdentity: string[];
  resolved: boolean;
};

export type CommanderRulesEngineInput = {
  parsedDeck: ParsedDeckEntry[];
  knownCards: DeckCard[];
  unknownCards: string[];
  commander: CommanderSelection;
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
  commanderName: string | null
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

  if (commanderName) {
    const normalizedCommanderName = normalizeName(commanderName);
    const bannedCommanderName = bannedByNormalizedName.get(normalizedCommanderName);
    if (bannedCommanderName && !findingsByCardName.has(bannedCommanderName)) {
      findingsByCardName.set(bannedCommanderName, 1);
    }
  }

  return [...findingsByCardName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => ({ name, qty }));
}

/**
 * Evaluates Commander legality rules and returns structured findings.
 */
export function evaluateCommanderRules(input: CommanderRulesEngineInput): RulesEngineReport {
  const checks = buildDeckChecks(input.parsedDeck, input.unknownCards);
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
  const banlistFindings = buildBanlistFindings(input.parsedDeck, input.commander.name);

  const rules: RulesEngineRuleResult[] = [
    buildRule({
      id: "commander.deck-size-exactly-100",
      name: "Deck Size Exactly 100",
      description: "Commander decks must contain exactly 100 cards including the commander.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: checks.deckSize.ok ? "PASS" : "FAIL",
      message: checks.deckSize.message,
      findings: []
    }),
    buildRule({
      id: "commander.singleton-non-basic",
      name: "Singleton (Non-Basic)",
      description: "No non-basic card can appear more than once.",
      domain: "DECK_CONSTRUCTION",
      severity: "ERROR",
      outcome: checks.singleton.ok ? "PASS" : "FAIL",
      message: checks.singleton.message,
      findings: checks.singleton.duplicates
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
      findings: banlistFindings
    }),
    buildRule({
      id: "commander.known-card-resolution",
      name: "Resolvable Card Names",
      description: "Unknown card names block full legality checks and should be corrected.",
      domain: "CARD_VALIDATION",
      severity: "WARN",
      outcome: checks.unknownCards.ok ? "PASS" : "FAIL",
      message: checks.unknownCards.message,
      findings: toNameCountList(checks.unknownCards.cards)
    }),
    buildRule({
      id: "commander.commander-selected",
      name: "Commander Selected",
      description: "A commander is required to validate color identity and format intent.",
      domain: "COMMANDER_RULES",
      severity: "WARN",
      outcome: input.commander.name ? "PASS" : "FAIL",
      message: input.commander.name
        ? `Commander selected: ${input.commander.name}.`
        : "Commander not selected. Add a commander to unlock full rules validation.",
      findings: input.commander.name ? [{ name: input.commander.name, qty: 1 }] : []
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
      }))
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
