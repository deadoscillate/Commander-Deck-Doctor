import { parseTypeLine } from "../core/Card";
import type { CardDefinition, CardFaceDefinition } from "../core/types";

export type CreateCardDefinitionInput = {
  oracleId: string;
  name: string;
  manaCost?: string;
  mv?: number;
  typeLine: string;
  colors?: string[];
  colorIdentity?: string[];
  oracleText?: string;
  keywords?: string[];
  power?: string | null;
  toughness?: string | null;
  loyalty?: string | null;
  legalities?: Record<string, string>;
  faces?: CardFaceDefinition[];
  behaviorId?: string;
};

export function createCardDefinition(input: CreateCardDefinitionInput): CardDefinition {
  return {
    oracleId: input.oracleId,
    name: input.name,
    faces: input.faces ?? [],
    manaCost: input.manaCost ?? "",
    mv: input.mv ?? 0,
    typeLine: input.typeLine,
    parsedTypeLine: parseTypeLine(input.typeLine),
    colors: input.colors ?? [],
    colorIdentity: input.colorIdentity ?? input.colors ?? [],
    oracleText: input.oracleText ?? "",
    keywords: input.keywords ?? [],
    power: input.power ?? null,
    toughness: input.toughness ?? null,
    loyalty: input.loyalty ?? null,
    legalities: input.legalities ?? { commander: "legal" },
    behaviorId: input.behaviorId
  };
}
