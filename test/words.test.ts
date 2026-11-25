import { describe, expect, it } from "vitest";
import { cleanOwnWord, editDistance, hintMask, judgeGuess, letterCount, maxReveals, normalizeWord } from "../src/guess";
import { levels, splitEntry, wordLanguages, wordList } from "../src/words";

describe("Comparing guesses", () => {
  it("ignores case, umlaut spellings, accents, spaces, hyphens and apostrophes", () => {
    expect(normalizeWord("Schlüssel")).toBe(normalizeWord("schluessel"));
    expect(normalizeWord("Schlüssel")).toBe(normalizeWord("SCHLUSSEL"));
    expect(normalizeWord("Straße")).toBe(normalizeWord("strasse"));
    expect(normalizeWord("Hula-Hoop")).toBe(normalizeWord("hula hoop"));
    expect(normalizeWord("Crème brûlée")).toBe(normalizeWord("creme brulee"));
    expect(normalizeWord("Rock'n'Roll")).toBe(normalizeWord("rocknroll"));
    expect(normalizeWord("Öl")).toBe(normalizeWord("oel"));
  });

  it("counts one typo as close, from 8 letters on two, and a swap of two letters as one typo", () => {
    expect(judgeGuess("Igel", ["Igel"])).toBe("hit");
    expect(judgeGuess("Igle", ["Igel"])).toBe("near");
    expect(judgeGuess("Ige", ["Igel"])).toBe("near");
    expect(judgeGuess("Iglu", ["Igel"])).toBe("miss");
    expect(judgeGuess("Leuchturn", ["Leuchtturm"])).toBe("near");
    expect(judgeGuess("Leucturn", ["Leuchtturm"])).toBe("miss");
    expect(judgeGuess("Rakete", ["Leuchtturm"])).toBe("miss");
  });

  it("accepts alternatives and treats a guess that contains the word as close, so it does not give it away", () => {
    expect(judgeGuess("Rad", ["Fahrrad", "Rad"])).toBe("hit");
    expect(judgeGuess("ein Leuchtturm", ["Leuchtturm"])).toBe("near");
    expect(judgeGuess("🎨!", ["Igel"])).toBe("miss");
  });

  it("measures the edit distance with a limit", () => {
    expect(editDistance("kitten", "sitting", 5)).toBe(3);
    expect(editDistance("abc", "abcdef", 1)).toBe(2);
    expect(editDistance("ab", "ba", 2)).toBe(1);
  });
});

describe("Hint boxes", () => {
  it("shows spaces, hyphens and apostrophes from the start and allows at most a third of the letters", () => {
    expect(hintMask("Hula-Hoop Reifen")).toBe("____-____ ______");
    expect(letterCount("Hula-Hoop Reifen")).toBe(14);
    expect(maxReveals("Ei")).toBe(0);
    expect(maxReveals("Hut")).toBe(1);
    expect(maxReveals("Igel")).toBe(1);
    expect(maxReveals("Leuchtturm")).toBe(2);
  });
});

describe("Own words", () => {
  it("tidies up spaces and accepts letters, digits, spaces, hyphens and apostrophes up to 20 characters", () => {
    expect(cleanOwnWord("  Rote   Rübe ")).toBe("Rote Rübe");
    expect(cleanOwnWord("Oma’s Garten")).toBe("Oma's Garten");
    expect(cleanOwnWord("Ü-Ei")).toBe("Ü-Ei");
    expect(cleanOwnWord("x")).toBeUndefined();
    expect(cleanOwnWord("Pizza!")).toBeUndefined();
    expect(cleanOwnWord("😀😀")).toBeUndefined();
    expect(cleanOwnWord("Donaudampfschifffahrt")).toBeUndefined();
  });
});

describe("Word lists", () => {
  it("has about 120 words per level and language, without duplicates, all valid for the hint boxes", () => {
    for (const language of wordLanguages) {
      const seen = new Map<string, string>();
      for (const level of levels) {
        const list = wordList(language, level);
        expect(list.length, `${language} level ${level}`).toBeGreaterThanOrEqual(118);
        expect(list.length, `${language} level ${level}`).toBeLessThanOrEqual(140);
        for (const entry of list) {
          const { text, alts } = splitEntry(entry);
          for (const variant of [text, ...alts]) {
            expect(cleanOwnWord(variant), `${language}: ${variant}`).toBe(variant);
          }
          const key = normalizeWord(text);
          expect(seen.get(key), `${language}: ${text} twice`).toBeUndefined();
          seen.set(key, text);
          expect(text.normalize("NFC")).toBe(text);
        }
      }
    }
  });

  it("keeps the German and the English lists separate, not as translations of each other", () => {
    const german = levels.flatMap((level) => wordList("de", level).map((entry) => normalizeWord(splitEntry(entry).text)));
    const english = new Set(levels.flatMap((level) => wordList("en", level).map((entry) => normalizeWord(splitEntry(entry).text))));
    const shared = german.filter((key) => english.has(key));
    expect(shared.length).toBeLessThan(25);
  });
});
