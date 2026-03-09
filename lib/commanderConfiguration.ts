import { canBeCommanderCard } from "./commanderOptions";
import type { ScryfallCard } from "./types";

export type CommanderPairType =
  | "single"
  | "partner"
  | "partner-with"
  | "friends-forever"
  | "doctor-companion"
  | "background";

export type CommanderConfigurationResult = {
  ok: boolean;
  pairType: CommanderPairType | null;
  message: string;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function oracleText(card: ScryfallCard): string {
  return [card.oracle_text, ...card.card_faces.map((face) => face.oracle_text ?? "")]
    .filter(Boolean)
    .join("\n");
}

function hasGenericPartner(card: ScryfallCard): boolean {
  const text = oracleText(card).toLowerCase();
  return /(^|\n)partner\b/.test(text) && !/partner with\b/.test(text);
}

function partnerWithName(card: ScryfallCard): string | null {
  const match = oracleText(card).match(/partner with ([^\n(]+)/i);
  return match?.[1]?.trim() ?? null;
}

function hasFriendsForever(card: ScryfallCard): boolean {
  return /friends forever/i.test(oracleText(card));
}

function hasDoctorsCompanion(card: ScryfallCard): boolean {
  return /doctor['’]s companion/i.test(oracleText(card));
}

function hasChooseBackground(card: ScryfallCard): boolean {
  return /choose a background/i.test(oracleText(card));
}

function isBackground(card: ScryfallCard): boolean {
  return /\bbackground\b/i.test(card.type_line);
}

function isDoctor(card: ScryfallCard): boolean {
  return /\btime lord doctor\b/i.test(card.type_line);
}

export function evaluateCommanderConfiguration(
  selectedNames: string[],
  resolvedCards: ScryfallCard[],
  resolved: boolean
): CommanderConfigurationResult {
  if (selectedNames.length === 0) {
    return {
      ok: false,
      pairType: null,
      message: "No commander selected."
    };
  }

  if (!resolved) {
    return {
      ok: false,
      pairType: null,
      message: `Commander configuration could not be fully resolved: ${selectedNames.join(" + ")}.`
    };
  }

  if (resolvedCards.length !== selectedNames.length) {
    return {
      ok: false,
      pairType: null,
      message: `Commander configuration could not be fully resolved: ${selectedNames.join(" + ")}.`
    };
  }

  if (resolvedCards.length === 1) {
    return canBeCommanderCard(resolvedCards[0])
      ? {
          ok: true,
          pairType: "single",
          message: `${resolvedCards[0].name} is commander-eligible.`
        }
      : {
          ok: false,
          pairType: null,
          message: `${resolvedCards[0].name} is not a legal commander under the current commander-card heuristic.`
        };
  }

  if (resolvedCards.length > 2) {
    return {
      ok: false,
      pairType: null,
      message: `Selected ${resolvedCards.length} commanders. Commander supports at most two commanders in legal paired configurations.`
    };
  }

  const [first, second] = resolvedCards;
  const firstPartnerWith = partnerWithName(first);
  const secondPartnerWith = partnerWithName(second);

  if (
    firstPartnerWith &&
    secondPartnerWith &&
    normalizeName(firstPartnerWith) === normalizeName(second.name) &&
    normalizeName(secondPartnerWith) === normalizeName(first.name)
  ) {
    return {
      ok: true,
      pairType: "partner-with",
      message: `${first.name} and ${second.name} form a legal "Partner with" pair.`
    };
  }

  if (hasGenericPartner(first) && hasGenericPartner(second)) {
    return {
      ok: true,
      pairType: "partner",
      message: `${first.name} and ${second.name} form a legal Partner pair.`
    };
  }

  if (hasFriendsForever(first) && hasFriendsForever(second)) {
    return {
      ok: true,
      pairType: "friends-forever",
      message: `${first.name} and ${second.name} form a legal Friends forever pair.`
    };
  }

  if (
    (isDoctor(first) && hasDoctorsCompanion(second)) ||
    (isDoctor(second) && hasDoctorsCompanion(first))
  ) {
    return {
      ok: true,
      pairType: "doctor-companion",
      message: `${first.name} and ${second.name} form a legal Doctor's companion pair.`
    };
  }

  if (
    (hasChooseBackground(first) && isBackground(second)) ||
    (hasChooseBackground(second) && isBackground(first))
  ) {
    return {
      ok: true,
      pairType: "background",
      message: `${first.name} and ${second.name} form a legal Choose a Background pairing.`
    };
  }

  return {
    ok: false,
    pairType: null,
    message: `${first.name} and ${second.name} do not form a legal two-commander pairing.`
  };
}
