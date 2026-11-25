import * as de from "./words-de";
import * as en from "./words-en";

export const wordLanguages = ["de", "en"] as const;
export type WordLanguage = (typeof wordLanguages)[number];

export const levels = [0, 1, 2] as const;
export type Level = (typeof levels)[number];

export const wordLists: Record<WordLanguage, readonly [readonly string[], readonly string[], readonly string[]]> = {
  de: [de.easy, de.medium, de.hard],
  en: [en.easy, en.medium, en.hard],
};

export function wordList(language: WordLanguage, level: Level): readonly string[] {
  return wordLists[language][level];
}

export function splitEntry(entry: string): { text: string; alts: string[] } {
  const [text, ...alts] = entry.split("|");
  return { text: text ?? entry, alts };
}
