/**
 * Canonical first-chapter mastery scope shared by independent runtime readers.
 * Keep this lightweight: the P0 startup reader must not pull in the complete
 * forest verifier solely to check its own signed projection.
 */
export const FOREST_CHAPTER_ACTIVE_WORD_IDS = Object.freeze([
  "word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa",
] as const);

export type ForestChapterActiveWordIds = typeof FOREST_CHAPTER_ACTIVE_WORD_IDS;
