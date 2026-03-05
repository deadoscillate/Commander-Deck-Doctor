import type { RoleFlags } from "./roleClassifier";
import type { RoleKey } from "./roleDefinitions";

export type RoleOverride = {
  forceOn?: RoleKey[];
  forceOff?: RoleKey[];
  reason: string;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export const ROLE_OVERRIDES_BY_ORACLE_ID: Record<string, RoleOverride> = {
  "82004860-e589-4e38-8d61-8c0210e4ea39": {
    forceOn: ["tutors"],
    reason: "Demonic Tutor is a canonical true tutor."
  },
  "e8863518-0bfa-49c3-8c6e-6c9116a81051": {
    forceOn: ["tutors"],
    reason: "Worldly Tutor is a canonical true tutor."
  },
  "fb81f95c-70f8-4eb7-8d15-15d0ae23ec03": {
    forceOn: ["tutors"],
    reason: "Mystical Tutor is a canonical true tutor."
  },
  "a54f0869-94c8-42af-9080-166efb9486a4": {
    forceOn: ["tutors"],
    reason: "Gamble is a canonical true tutor."
  },
  "16cd0b90-f70c-4efa-b252-8de8784ef9a3": {
    forceOn: ["tutors"],
    reason: "Imperial Seal is a canonical true tutor."
  },
  "038519b9-bca8-4b27-b5ac-2409595469d0": {
    forceOn: ["tutors"],
    reason: "Diabolic Intent is a true tutor despite additional cost."
  },
  "721eb5a2-d7cf-4db0-8013-ef3f596c52a5": {
    forceOn: ["tutors"],
    reason: "Doomsday is a deck-stack tutor effect."
  },
  "8c1fe337-375a-4add-93b6-0ac39ed72b4f": {
    forceOn: ["tutors"],
    reason: "Natural Order is a true tutor into battlefield."
  },
  "d75b9c82-1b49-4c3e-a1b5-aeef57d6644b": {
    forceOn: ["wipes"],
    forceOff: ["removal"],
    reason: "Cyclonic Rift (overload mode) is treated as wipe signal, not targeted removal."
  },
  "ccaa44f2-96be-44e2-884f-c31baa3908d5": {
    forceOn: ["wipes"],
    forceOff: ["removal"],
    reason: "Kindred Dominance is a board wipe."
  },
  "0d4ecdb1-ec90-497f-a7a4-1c68092b8757": {
    forceOn: ["protection"],
    reason: "Teferi's Protection is a flagship protection effect."
  },
  "24882fa2-3fe9-4c1b-aa3d-0e6488b9db27": {
    forceOn: ["protection"],
    reason: "Heroic Intervention is a flagship protection effect."
  },
  "69872a9a-fe54-4e58-940c-89395af71acd": {
    forceOn: ["tutors", "finishers"],
    reason: "Finale of Devastation commonly functions as both tutor and finisher."
  }
};

export const ROLE_OVERRIDES_BY_NAME: Record<string, RoleOverride> = {
  mysticaltutor: {
    forceOn: ["tutors"],
    reason: "Name fallback override for Mystical Tutor."
  },
  imperialseal: {
    forceOn: ["tutors"],
    reason: "Name fallback override for Imperial Seal."
  },
  diabolicintent: {
    forceOn: ["tutors"],
    reason: "Name fallback override for Diabolic Intent."
  },
  cyclonicrift: {
    forceOn: ["wipes"],
    forceOff: ["removal"],
    reason: "Name fallback override for Cyclonic Rift."
  },
  teferisprotection: {
    forceOn: ["protection"],
    reason: "Name fallback override for Teferi's Protection."
  },
  finaleofdevastation: {
    forceOn: ["tutors", "finishers"],
    reason: "Name fallback override for Finale of Devastation."
  }
};

export type ResolvedRoleOverride = {
  key: string;
  source: "oracle_id" | "name";
  override: RoleOverride;
} | null;

export function resolveRoleOverride(input: { oracleId?: string | null; cardName?: string | null }): ResolvedRoleOverride {
  if (typeof input.oracleId === "string" && input.oracleId.trim()) {
    const byOracle = ROLE_OVERRIDES_BY_ORACLE_ID[input.oracleId.trim()];
    if (byOracle) {
      return {
        key: input.oracleId.trim(),
        source: "oracle_id",
        override: byOracle
      };
    }
  }

  if (typeof input.cardName === "string" && input.cardName.trim()) {
    const normalized = normalizeName(input.cardName);
    const byName = ROLE_OVERRIDES_BY_NAME[normalized];
    if (byName) {
      return {
        key: normalized,
        source: "name",
        override: byName
      };
    }
  }

  return null;
}

export function applyRoleOverride(flags: RoleFlags, resolved: ResolvedRoleOverride): RoleFlags {
  if (!resolved) {
    return flags;
  }

  const next = { ...flags };
  const forceOn = resolved.override.forceOn ?? [];
  const forceOff = resolved.override.forceOff ?? [];

  for (const key of forceOn) {
    next[key] = true;
  }

  for (const key of forceOff) {
    next[key] = false;
  }

  return next;
}
