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

  if (firstPartnerWith || secondPartnerWith) {
    if (!firstPartnerWith || !secondPartnerWith) {
      const namedCard = firstPartnerWith ? first : second;
      const otherCard = firstPartnerWith ? second : first;
      return {
        ok: false,
        pairType: null,
        message: `${namedCard.name} uses "Partner with", but ${otherCard.name} does not name it back.`
      };
    }

    return {
      ok: false,
      pairType: null,
      message: `${first.name} and ${second.name} have "Partner with" text, but they are not paired with each other.`
    };
  }

  if (hasGenericPartner(first) !== hasGenericPartner(second)) {
    const partnerCard = hasGenericPartner(first) ? first : second;
    const otherCard = hasGenericPartner(first) ? second : first;
    return {
      ok: false,
      pairType: null,
      message: `${partnerCard.name} has Partner, but ${otherCard.name} does not.`
    };
  }

  if (hasFriendsForever(first) !== hasFriendsForever(second)) {
    const friendsCard = hasFriendsForever(first) ? first : second;
    const otherCard = hasFriendsForever(first) ? second : first;
    return {
      ok: false,
      pairType: null,
      message: `${friendsCard.name} has Friends forever, but ${otherCard.name} does not.`
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

  if (isDoctor(first) || isDoctor(second) || hasDoctorsCompanion(first) || hasDoctorsCompanion(second)) {
    if (isDoctor(first) && !hasDoctorsCompanion(second)) {
      return {
        ok: false,
        pairType: null,
        message: `${first.name} is a Doctor, but ${second.name} does not have Doctor's companion.`
      };
    }

    if (isDoctor(second) && !hasDoctorsCompanion(first)) {
      return {
        ok: false,
        pairType: null,
        message: `${second.name} is a Doctor, but ${first.name} does not have Doctor's companion.`
      };
    }

    if (hasDoctorsCompanion(first) && !isDoctor(second)) {
      return {
        ok: false,
        pairType: null,
        message: `${first.name} has Doctor's companion, but ${second.name} is not a Doctor.`
      };
    }

    if (hasDoctorsCompanion(second) && !isDoctor(first)) {
      return {
        ok: false,
        pairType: null,
        message: `${second.name} has Doctor's companion, but ${first.name} is not a Doctor.`
      };
    }
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

  if (hasChooseBackground(first) || hasChooseBackground(second) || isBackground(first) || isBackground(second)) {
    if (hasChooseBackground(first) && !isBackground(second)) {
      return {
        ok: false,
        pairType: null,
        message: `${first.name} has Choose a Background, but ${second.name} is not a Background.`
      };
    }

    if (hasChooseBackground(second) && !isBackground(first)) {
      return {
        ok: false,
        pairType: null,
        message: `${second.name} has Choose a Background, but ${first.name} is not a Background.`
      };
    }

    if (isBackground(first) && !hasChooseBackground(second)) {
      return {
        ok: false,
        pairType: null,
        message: `${first.name} is a Background, but ${second.name} does not have Choose a Background.`
      };
    }

    if (isBackground(second) && !hasChooseBackground(first)) {
      return {
        ok: false,
        pairType: null,
        message: `${second.name} is a Background, but ${first.name} does not have Choose a Background.`
      };
    }
  }

  return {
    ok: false,
    pairType: null,
    message: `${first.name} and ${second.name} do not form a legal two-commander pairing.`
  };
}
