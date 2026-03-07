import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WIZARDS_RULES_URL = "https://magic.wizards.com/en/rules";
const COMMANDER_RULES_PAGE_URL = "https://mtgcommander.net/index.php/rules/";
const COMMANDER_BANLIST_PAGE_URL = "https://mtgcommander.net/index.php/banned-list/";
const COMMANDER_RULES_API_URL =
  "https://mtgcommander.net/index.php/wp-json/wp/v2/pages?slug=rules";
const COMMANDER_BANLIST_API_URL =
  "https://mtgcommander.net/index.php/wp-json/wp/v2/pages?slug=banned-list";

const DATASET_DIR = path.join(process.cwd(), "lib", "rules", "datasets");
const OFFICIAL_RULES_DATASET_PATH = path.join(DATASET_DIR, "officialRules.json");
const BANLIST_DATASET_PATH = path.join(DATASET_DIR, "banlist.json");

function decodeHtmlEntities(value) {
  const decoded = value
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&hellip;/gi, "...")
    .replace(/&mdash;/gi, "-")
    .replace(/&ndash;/gi, "-")
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/Â/g, "");

  const repaired = /â[\u0080-\u00BF]/.test(decoded)
    ? Buffer.from(decoded, "latin1").toString("utf8")
    : decoded;

  return repaired.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, " ").replace(/\s+([),.;:!?])/g, "$1").trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Commander-Deck-Doctor-RulesSync/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed request (${response.status}) for ${url}`);
  }

  return await response.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function extractCompRulesLinks(rulesPageHtml) {
  const matches = [...rulesPageHtml.matchAll(/https:\/\/media\.wizards\.com\/\d{4}\/downloads\/MagicCompRules\s*\d{8}\.(?:docx|pdf|txt)/gi)]
    .map((match) => normalizeSpaces(match[0]));

  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    throw new Error("Could not locate Magic Comprehensive Rules links on Wizards rules page.");
  }

  const links = {
    docx: unique.find((value) => value.toLowerCase().endsWith(".docx")) ?? null,
    pdf: unique.find((value) => value.toLowerCase().endsWith(".pdf")) ?? null,
    txt: unique.find((value) => value.toLowerCase().endsWith(".txt")) ?? null
  };

  if (!links.txt) {
    throw new Error("Could not locate Magic Comprehensive Rules TXT link.");
  }

  return links;
}

function parseCompRulesRevision(txtUrl) {
  const match = txtUrl.match(/MagicCompRules\s*([0-9]{8})\.txt/i);
  return match ? match[1] : null;
}

function parseCompRulesEffectiveDate(compRulesText) {
  const clean = compRulesText.replace(/^\uFEFF/, "");
  const match = clean.match(/These rules are effective as of ([^.]+)\./i);
  return match ? normalizeSpaces(match[1]) : null;
}

function extractDeckConstructionRules(commanderRulesHtml) {
  const sectionMatch = commanderRulesHtml.match(
    /Deck Construction Rules<\/h4>[\s\S]*?<ol>([\s\S]*?)<\/ol>/i
  );
  if (!sectionMatch) {
    return [];
  }

  return [...sectionMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((match) => normalizeSpaces(decodeHtmlEntities(stripTags(match[1]))))
    .filter(Boolean);
}

function extractCategoryBans(banlistHtml) {
  const listMatch = banlistHtml.match(/<ul>([\s\S]*?)<\/ul>/i);
  if (!listMatch) {
    return [];
  }

  return [...listMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((match) => normalizeSpaces(decodeHtmlEntities(stripTags(match[1]))))
    .filter(Boolean);
}

function extractBannedCardNames(banlistHtml) {
  const names = [...banlistHtml.matchAll(/<summary>([\s\S]*?)<\/summary>/gi)]
    .map((match) => normalizeSpaces(decodeHtmlEntities(stripTags(match[1]))))
    .filter(Boolean);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function toIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toDateOnly(value) {
  return typeof value === "string" ? value.slice(0, 10) : null;
}

async function main() {
  const nowIso = new Date().toISOString();
  const wizardsRulesHtml = await fetchText(WIZARDS_RULES_URL);
  const compRulesLinks = extractCompRulesLinks(wizardsRulesHtml);
  const txtUrl = compRulesLinks.txt.replace(/\s/g, "%20");
  const compRulesText = await fetchText(txtUrl);
  const compRulesSha = createHash("sha256").update(compRulesText, "utf8").digest("hex");
  const compRulesRevision = parseCompRulesRevision(compRulesLinks.txt);
  const compRulesEffectiveDate = parseCompRulesEffectiveDate(compRulesText);

  const commanderRulesResponse = await fetchJson(COMMANDER_RULES_API_URL);
  const commanderBanlistResponse = await fetchJson(COMMANDER_BANLIST_API_URL);
  const commanderRulesPage = Array.isArray(commanderRulesResponse) ? commanderRulesResponse[0] : null;
  const commanderBanlistPage = Array.isArray(commanderBanlistResponse)
    ? commanderBanlistResponse[0]
    : null;

  if (!commanderRulesPage?.content?.rendered) {
    throw new Error("Commander rules content was not found in official API response.");
  }
  if (!commanderBanlistPage?.content?.rendered) {
    throw new Error("Commander banlist content was not found in official API response.");
  }

  const commanderRulesLastModified = toIsoDate(commanderRulesPage.modified_gmt ?? commanderRulesPage.modified);
  const commanderBanlistLastModified = toIsoDate(
    commanderBanlistPage.modified_gmt ?? commanderBanlistPage.modified
  );
  const deckConstructionRules = extractDeckConstructionRules(commanderRulesPage.content.rendered);
  const categoryBans = extractCategoryBans(commanderBanlistPage.content.rendered);
  const bannedNames = extractBannedCardNames(commanderBanlistPage.content.rendered);
  const banlistVersionDate = toDateOnly(commanderBanlistLastModified) ?? toDateOnly(nowIso) ?? "1970-01-01";

  const officialRulesDataset = {
    generatedAt: nowIso,
    sources: {
      comprehensiveRulesPageUrl: WIZARDS_RULES_URL,
      commanderRulesPageUrl: COMMANDER_RULES_PAGE_URL,
      commanderBanlistPageUrl: COMMANDER_BANLIST_PAGE_URL
    },
    comprehensiveRules: {
      txtUrl: compRulesLinks.txt,
      pdfUrl: compRulesLinks.pdf,
      docxUrl: compRulesLinks.docx,
      revision: compRulesRevision,
      effectiveDate: compRulesEffectiveDate,
      sha256: compRulesSha
    },
    commanderRules: {
      apiUrl: COMMANDER_RULES_API_URL,
      pageUrl: COMMANDER_RULES_PAGE_URL,
      lastModified: commanderRulesLastModified,
      deckConstructionRules
    },
    commanderBanlist: {
      apiUrl: COMMANDER_BANLIST_API_URL,
      pageUrl: COMMANDER_BANLIST_PAGE_URL,
      lastModified: commanderBanlistLastModified,
      categoryBans,
      totalBannedCards: bannedNames.length,
      bannedNames
    }
  };

  const banlistDataset = {
    versionDate: banlistVersionDate,
    fetchedAt: nowIso,
    sourceUrl: COMMANDER_BANLIST_PAGE_URL,
    sourceApiUrl: COMMANDER_BANLIST_API_URL,
    lastModified: commanderBanlistLastModified,
    categoryBans,
    bannedNames
  };

  await mkdir(DATASET_DIR, { recursive: true });
  await writeFile(OFFICIAL_RULES_DATASET_PATH, `${JSON.stringify(officialRulesDataset, null, 2)}\n`, "utf8");
  await writeFile(BANLIST_DATASET_PATH, `${JSON.stringify(banlistDataset, null, 2)}\n`, "utf8");

  console.log(
    `Updated rules datasets:\n- ${OFFICIAL_RULES_DATASET_PATH}\n- ${BANLIST_DATASET_PATH}\n` +
      `Banned cards: ${bannedNames.length}\nBanlist version date: ${banlistVersionDate}\n` +
      `Comprehensive Rules revision: ${compRulesRevision ?? "unknown"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
