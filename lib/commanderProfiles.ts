import curatedProfiles from "@/data/commander-profiles/curated.json";

export type CommanderProfileGroup = {
  key: string;
  label: string;
  description: string;
  cards: string[];
};

export type CommanderProfile = {
  commanderName: string;
  aliases?: string[];
  tags?: string[];
  groups: CommanderProfileGroup[];
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const COMMANDER_PROFILES = curatedProfiles as CommanderProfile[];
const COMMANDER_PROFILE_INDEX = new Map<string, CommanderProfile>();

for (const profile of COMMANDER_PROFILES) {
  COMMANDER_PROFILE_INDEX.set(normalizeName(profile.commanderName), profile);
  for (const alias of profile.aliases ?? []) {
    COMMANDER_PROFILE_INDEX.set(normalizeName(alias), profile);
  }
}

export function getCommanderProfile(name: string): CommanderProfile | null {
  return COMMANDER_PROFILE_INDEX.get(normalizeName(name)) ?? null;
}

export function getCommanderProfileCount(): number {
  return COMMANDER_PROFILES.length;
}

export function getCommanderProfiles(): CommanderProfile[] {
  return COMMANDER_PROFILES;
}

