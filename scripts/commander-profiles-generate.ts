import fs from "node:fs/promises";
import path from "node:path";
import { COMMANDER_SIGNAL_SUGGESTION_GROUPS, buildCommanderSignalPattern } from "@/lib/commanderSignals";
import type { CommanderProfile } from "@/lib/commanderProfiles";

type OracleCard = {
  name: string;
  type_line?: string;
  oracle_text?: string;
  legalities?: { commander?: string };
  card_faces?: Array<{
    oracle_text?: string;
    type_line?: string;
  }>;
};

const ORACLE_PATH = path.resolve("data/scryfall/oracle-cards.compiled.json");
const CURATED_PATH = path.resolve("data/commander-profiles/curated.json");
const DEFAULT_OUTPUT_PATH = path.resolve("data/commander-profiles/generated.json");

function normalizeName(name: string): string {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isDigitalVariantName(name: string): boolean {
  return /^A-/.test(name);
}

function isPlaceholderCommanderName(name: string): boolean {
  return /_{2,}/.test(name);
}

function isCommanderEligible(card: OracleCard): boolean {
  const oracleText = [card.oracle_text ?? "", ...(card.card_faces ?? []).map((face) => face.oracle_text ?? "")]
    .join("\n")
    .toLowerCase();
  const typeLine = [card.type_line ?? "", ...(card.card_faces ?? []).map((face) => face.type_line ?? "")]
    .join("\n")
    .toLowerCase();

  const commanderLegal = card.legalities?.commander === "legal";
  const legendaryCreature = typeLine.includes("legendary") && typeLine.includes("creature");
  const explicitCommanderText = oracleText.includes("can be your commander");
  return commanderLegal && (legendaryCreature || explicitCommanderText);
}

function inferTags(card: OracleCard, matchedKeys: string[]): string[] {
  const text = `${card.type_line ?? ""}\n${card.oracle_text ?? ""}`.toLowerCase();
  const tags = new Set<string>();

  for (const key of matchedKeys) {
    if (key.includes("combat")) tags.add("combat");
    if (key.includes("token")) tags.add("tokens");
    if (key.includes("counter")) tags.add("counters");
    if (key.includes("graveyard") || key.includes("reanimation")) tags.add("graveyard");
    if (key.includes("artifact")) tags.add("artifacts");
    if (key.includes("enchantment")) tags.add("enchantress");
    if (key.includes("voltron")) tags.add("voltron");
    if (key.includes("treasure")) tags.add("treasure");
    if (key.includes("land")) tags.add("lands");
    if (key.includes("spell")) tags.add("spellslinger");
    if (key.includes("lifegain")) tags.add("lifegain");
    if (key.includes("exile")) tags.add("exile-cast");
  }

  if (/\belf\b|\bgoblin\b|\bmerfolk\b|\bzombie\b|\bangel\b|\bdragon\b|\bsliver\b/i.test(text)) {
    tags.add("kindred");
  }

  return Array.from(tags);
}

function buildProfile(card: OracleCard): CommanderProfile {
  const oracleText = card.oracle_text ?? "";
  const matchedGroups = COMMANDER_SIGNAL_SUGGESTION_GROUPS
    .filter((group) => buildCommanderSignalPattern(group.patternSource).test(oracleText))
    .map((group) => ({
      key: group.key,
      label: group.label,
      description: group.description,
      cards: group.names
    }));

  return {
    commanderName: card.name,
    tags: inferTags(card, matchedGroups.map((group) => group.key)),
    groups: matchedGroups
  };
}

function parseArgs(argv: string[]) {
  const names: string[] = [];
  let limit = Number.MAX_SAFE_INTEGER;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let includeCurated = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--name") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --name");
      }
      names.push(value);
      index += 1;
      continue;
    }

    if (token === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Invalid value for --limit");
      }
      limit = Math.floor(value);
      index += 1;
      continue;
    }

    if (token === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      outputPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (token === "--include-curated") {
      includeCurated = true;
      continue;
    }
  }

  return { names, limit, outputPath, includeCurated };
}

async function main() {
  const { names, limit, outputPath, includeCurated } = parseArgs(process.argv.slice(2));
  const [oracleRaw, curatedRaw] = await Promise.all([
    fs.readFile(ORACLE_PATH, "utf8"),
    fs.readFile(CURATED_PATH, "utf8")
  ]);

  const oracleCards = JSON.parse(oracleRaw) as OracleCard[];
  const curatedProfiles = JSON.parse(curatedRaw) as CommanderProfile[];
  const curatedNames = new Set(curatedProfiles.map((profile) => normalizeName(profile.commanderName)));
  const requestedNames = names.map((name) => normalizeName(name));

  const candidates = oracleCards
    .filter((card) => card && typeof card.name === "string")
    .filter((card) => !isDigitalVariantName(card.name))
    .filter((card) => !isPlaceholderCommanderName(card.name))
    .filter((card) => isCommanderEligible(card))
    .filter((card) => includeCurated || !curatedNames.has(normalizeName(card.name)))
    .filter((card) => requestedNames.length === 0 || requestedNames.includes(normalizeName(card.name)))
    .map((card) => buildProfile(card))
    .sort((left, right) => left.commanderName.localeCompare(right.commanderName))
    .slice(0, limit);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(candidates, null, 2) + "\n", "utf8");

  console.log(`Wrote ${candidates.length} commander profile candidates to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
