import fs from "node:fs";
import path from "node:path";
import { classifyCardRoles, classifyTutorSignals, classifyTypeBuckets } from "../engine/cards/roleClassifier";

type CompiledCardFace = {
  oracle_text?: string;
};

type CompiledCard = {
  oracle_id?: string;
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  card_faces?: CompiledCardFace[] | null;
};

type BulkDataList = {
  data?: Array<{
    type?: string;
    updated_at?: string;
    download_uri?: string;
    compressed_size?: number;
    content_type?: string;
    content_encoding?: string;
  }>;
};

type BulkMeta = {
  updated_at: string | null;
  download_uri: string | null;
  compressed_size: number | null;
  content_type: string | null;
  content_encoding: string | null;
};

const DATA_DIR = path.resolve("data/scryfall");
const COMPILED_PATH = path.join(DATA_DIR, "oracle-cards.compiled.json");
const LOCAL_META_PATH = path.join(DATA_DIR, "oracle-cards.meta.json");
const OUTPUT_PATH = path.join(DATA_DIR, "oracle-cards.categories.json");
const NEEDS_REVIEW_PATH = path.join(DATA_DIR, "oracle-cards.needs-review.json");

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readCompiledCards(): CompiledCard[] {
  if (!fs.existsSync(COMPILED_PATH)) {
    throw new Error(`Missing compiled file: ${COMPILED_PATH}. Run: npm run scryfall:update`);
  }

  const payload = JSON.parse(fs.readFileSync(COMPILED_PATH, "utf8")) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error(`Invalid compiled file format at ${COMPILED_PATH}: expected array`);
  }

  return payload as CompiledCard[];
}

async function fetchBulkOracleMeta(): Promise<BulkMeta> {
  const response = await fetch("https://api.scryfall.com/bulk-data");
  if (!response.ok) {
    throw new Error(`Failed to fetch Scryfall bulk metadata: ${response.status}`);
  }

  const json = (await response.json()) as BulkDataList;
  const oracle = json.data?.find((item) => item.type === "oracle_cards");
  if (!oracle) {
    throw new Error("Could not find oracle_cards entry in Scryfall bulk metadata response");
  }

  return {
    updated_at: oracle.updated_at ?? null,
    download_uri: oracle.download_uri ?? null,
    compressed_size: typeof oracle.compressed_size === "number" ? oracle.compressed_size : null,
    content_type: oracle.content_type ?? null,
    content_encoding: oracle.content_encoding ?? null
  };
}

function readLocalMetaUpdatedAt(): string | null {
  if (!fs.existsSync(LOCAL_META_PATH)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(LOCAL_META_PATH, "utf8")) as unknown;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.updated_at === "string" ? record.updated_at : null;
}

function normalizeOracleText(card: CompiledCard): string {
  const faceText = Array.isArray(card.card_faces)
    ? card.card_faces.map((face) => (typeof face.oracle_text === "string" ? face.oracle_text : "")).filter(Boolean)
    : [];

  return [typeof card.oracle_text === "string" ? card.oracle_text : "", ...faceText].filter(Boolean).join("\n");
}

function normalizeCardName(card: CompiledCard, fallbackIndex: number): string {
  if (typeof card.name === "string" && card.name.trim()) {
    return card.name.trim();
  }

  return `Unknown Card ${fallbackIndex + 1}`;
}

function normalizeOracleId(card: CompiledCard, fallbackName: string, fallbackIndex: number): string {
  if (typeof card.oracle_id === "string" && card.oracle_id.trim()) {
    return card.oracle_id.trim();
  }

  return `missing-oracle-id-${fallbackIndex + 1}-${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const [cards, remoteBulkMeta] = await Promise.all([readCompiledCards(), fetchBulkOracleMeta()]);
  const localMetaUpdatedAt = readLocalMetaUpdatedAt();

  const roleTotals = {
    ramp: 0,
    draw: 0,
    removal: 0,
    wipes: 0,
    tutors: 0,
    protection: 0,
    finishers: 0
  };
  const typeTotals = {
    creature: 0,
    instant: 0,
    sorcery: 0,
    artifact: 0,
    enchantment: 0,
    planeswalker: 0,
    land: 0,
    battle: 0
  };
  let trueTutorCards = 0;
  let tutorSignalCards = 0;
  const reviewReasonTotals = new Map<string, number>();

  const needsReview: Array<{
    oracle_id: string;
    name: string;
    type_line: string;
    reasons: string[];
    role_flags: Record<string, boolean>;
    tutor: { trueTutor: boolean; tutorSignal: boolean };
    oracle_text_preview: string;
  }> = [];

  const categorized = cards.map((card, index) => {
    const name = normalizeCardName(card, index);
    const oracleId = normalizeOracleId(card, name, index);
    const typeLine = typeof card.type_line === "string" ? card.type_line : "";
    const oracleText = normalizeOracleText(card);
    const keywords = toStringArray(card.keywords);

    const roleFlags = classifyCardRoles({
      typeLine,
      oracleText,
      keywords,
      behaviorId: null,
      oracleId,
      cardName: name
    });
    const typeFlags = classifyTypeBuckets(typeLine);
    const tutorBase = classifyTutorSignals({
      typeLine,
      oracleText,
      keywords,
      behaviorId: null
    });
    const tutor = {
      trueTutor: roleFlags.tutors,
      tutorSignal: tutorBase.tutorSignal || roleFlags.tutors
    };

    for (const key of Object.keys(roleTotals) as Array<keyof typeof roleTotals>) {
      if (roleFlags[key]) {
        roleTotals[key] += 1;
      }
    }

    for (const key of Object.keys(typeTotals) as Array<keyof typeof typeTotals>) {
      if (typeFlags[key]) {
        typeTotals[key] += 1;
      }
    }

    if (tutor.trueTutor) {
      trueTutorCards += 1;
    }
    if (tutor.tutorSignal) {
      tutorSignalCards += 1;
    }

    const roleMatches = Object.values(roleFlags).filter(Boolean).length;
    const reasons: string[] = [];
    if (!typeFlags.land && roleMatches === 0 && oracleText.trim().length > 0) {
      reasons.push("NO_ROLE_MATCH_NONLAND");
    }
    if (tutor.tutorSignal && !tutor.trueTutor) {
      reasons.push("TUTOR_SIGNAL_ONLY");
    }
    if (roleFlags.wipes && roleFlags.removal) {
      reasons.push("ROLE_CONFLICT_WIPE_AND_REMOVAL");
    }
    if (oracleText.length >= 320 && roleMatches <= 1) {
      reasons.push("LONG_ORACLE_TEXT_LOW_ROLE_COVERAGE");
    }

    if (reasons.length > 0) {
      for (const reason of reasons) {
        reviewReasonTotals.set(reason, (reviewReasonTotals.get(reason) ?? 0) + 1);
      }

      needsReview.push({
        oracle_id: oracleId,
        name,
        type_line: typeLine,
        reasons,
        role_flags: roleFlags,
        tutor,
        oracle_text_preview: oracleText.slice(0, 240)
      });
    }

    return {
      oracle_id: oracleId,
      name,
      type_line: typeLine,
      role_flags: roleFlags,
      type_flags: typeFlags,
      tutor
    };
  });

  const staleWarning =
    remoteBulkMeta.updated_at && localMetaUpdatedAt && remoteBulkMeta.updated_at !== localMetaUpdatedAt
      ? `Local compiled data may be stale. local updated_at=${localMetaUpdatedAt}, remote updated_at=${remoteBulkMeta.updated_at}. Run npm run scryfall:update.`
      : null;

  const payload = {
    generated_at: new Date().toISOString(),
    source: {
      local_compiled_path: COMPILED_PATH,
      local_card_count: cards.length,
      local_meta_updated_at: localMetaUpdatedAt,
      remote_bulk_oracle: remoteBulkMeta
    },
    summary: {
      role_totals: roleTotals,
      type_totals: typeTotals,
      true_tutor_cards: trueTutorCards,
      tutor_signal_cards: tutorSignalCards,
      stale_warning: staleWarning
    },
    cards: categorized
  };
  const reviewPayload = {
    generated_at: payload.generated_at,
    source: payload.source,
    summary: {
      total_flagged: needsReview.length,
      reason_totals: Object.fromEntries([...reviewReasonTotals.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      stale_warning: staleWarning
    },
    cards: needsReview
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  fs.writeFileSync(NEEDS_REVIEW_PATH, `${JSON.stringify(reviewPayload)}\n`, "utf8");

  console.log(`Categorized ${cards.length} cards: ${OUTPUT_PATH}`);
  console.log(`Review report: ${NEEDS_REVIEW_PATH} (flagged ${needsReview.length} cards)`);
  console.log(`Role totals: ${JSON.stringify(roleTotals)}`);
  console.log(`Type totals: ${JSON.stringify(typeTotals)}`);
  console.log(`Tutor totals: true=${trueTutorCards}, signal=${tutorSignalCards}`);
  if (staleWarning) {
    console.warn(staleWarning);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
