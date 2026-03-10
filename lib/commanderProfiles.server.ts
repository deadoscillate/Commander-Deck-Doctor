import curatedProfiles from "@/data/commander-profiles/curated.json";
import generatedProfiles from "@/data/commander-profiles/generated.json";
import type { CommanderProfile } from "@/lib/commanderProfiles";

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const curated = curatedProfiles as CommanderProfile[];
const generated = generatedProfiles as CommanderProfile[];

const curatedIndex = new Map<string, CommanderProfile>();
const generatedIndex = new Map<string, CommanderProfile>();

function populateIndex(index: Map<string, CommanderProfile>, profiles: CommanderProfile[]) {
  for (const profile of profiles) {
    index.set(normalizeName(profile.commanderName), profile);
    for (const alias of profile.aliases ?? []) {
      index.set(normalizeName(alias), profile);
    }
  }
}

populateIndex(curatedIndex, curated);
populateIndex(generatedIndex, generated);

export function getCuratedCommanderProfile(name: string): CommanderProfile | null {
  return curatedIndex.get(normalizeName(name)) ?? null;
}

export function getGeneratedCommanderProfile(name: string): CommanderProfile | null {
  return generatedIndex.get(normalizeName(name)) ?? null;
}

export function getMergedCommanderProfile(name: string): {
  profile: CommanderProfile | null;
  source: "curated" | "generated" | "none";
} {
  const curatedProfile = getCuratedCommanderProfile(name);
  if (curatedProfile) {
    return { profile: curatedProfile, source: "curated" };
  }

  const generatedProfile = getGeneratedCommanderProfile(name);
  if (generatedProfile) {
    return { profile: generatedProfile, source: "generated" };
  }

  return { profile: null, source: "none" };
}
