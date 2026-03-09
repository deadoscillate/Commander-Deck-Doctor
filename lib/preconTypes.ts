export type PreconSummary = {
  slug: string;
  code: string;
  fileName: string;
  name: string;
  releaseDate: string;
  type: string;
  commanderNames: string[];
  displayCommanderNames: string[];
  colorIdentity: string[];
  cardCount: number;
  sourceUrl: string;
};

export type PreconDeck = PreconSummary & {
  decklist: string;
};

export type PreconLibraryMeta = {
  generatedAt: string;
  sourceUrl: string;
  totalDecks: number;
};

export type PreconLibraryFile = {
  meta: PreconLibraryMeta;
  data: PreconDeck[];
};
