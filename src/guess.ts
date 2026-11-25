export type Verdict = "hit" | "near" | "miss" | "long";

export const maxGuessLength = 40;
export const maxOwnWordLength = 20;
export const maxGuessWords = 3;

const letterMap: Record<string, string> = {
  ä: "a",
  à: "a",
  á: "a",
  â: "a",
  ã: "a",
  å: "a",
  æ: "ae",
  ç: "c",
  ð: "d",
  đ: "d",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ì: "i",
  í: "i",
  î: "i",
  ï: "i",
  ñ: "n",
  ö: "o",
  ò: "o",
  ó: "o",
  ô: "o",
  õ: "o",
  ø: "o",
  œ: "oe",
  ü: "u",
  ù: "u",
  ú: "u",
  û: "u",
  ý: "y",
  ÿ: "y",
  þ: "th",
  ß: "ss",
};

export type CompareLanguage = "de" | "en";

export function normalizeWord(text: string, language: CompareLanguage = "de"): string {
  let plain = "";
  for (const char of text.toLowerCase()) {
    const mapped = letterMap[char] ?? char;
    for (const part of mapped) {
      if ((part >= "a" && part <= "z") || (part >= "0" && part <= "9")) {
        plain += part;
      }
    }
  }
  return language === "de" ? plain.split("ae").join("a").split("oe").join("o").split("ue").join("u") : plain;
}

export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let before: number[] = [];
  let previous: number[] = [];
  for (let j = 0; j <= b.length; j++) {
    previous.push(j);
  }
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (before[j - 2] ?? 0) + 1);
      }
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) {
      return limit + 1;
    }
    before = previous;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

export function typoLimit(word: string): number {
  return word.length >= 8 ? 2 : 1;
}

function wordsOf(text: string, language: CompareLanguage): string[] {
  return text
    .split(/\s+/)
    .map((part) => normalizeWord(part, language))
    .filter((word) => word.length > 0);
}

function isClose(candidate: string, key: string): boolean {
  const limit = typoLimit(key);
  return editDistance(candidate, key, limit) <= limit;
}

export function judgeGuess(guess: string, answers: readonly string[], language: CompareLanguage = "de"): Verdict {
  const plain = normalizeWord(guess, language);
  if (plain.length === 0) {
    return "miss";
  }
  const keys = answers.map((answer) => normalizeWord(answer, language)).filter((key) => key.length > 0);
  if (keys.includes(plain)) {
    return "hit";
  }
  if (keys.some((key) => isClose(plain, key))) {
    return "near";
  }
  const parts = wordsOf(guess, language);
  if (parts.length > Math.max(maxGuessWords, ...answers.map((answer) => wordsOf(answer, language).length))) {
    return "long";
  }
  const candidates = [...parts, ...parts.slice(1).map((part, index) => `${parts[index] ?? ""}${part}`)];
  return parts.length > 1 && candidates.some((candidate) => keys.some((key) => isClose(candidate, key))) ? "near" : "miss";
}

const allowedInWord = /^[A-Za-z0-9À-ÖØ-öø-ÿŒœ' -]+$/;

export function cleanOwnWord(raw: string): string | undefined {
  const text = raw.split("’").join("'").trim().split(/\s+/).join(" ");
  const chars = [...text];
  if (chars.length > maxOwnWordLength || !allowedInWord.test(text)) {
    return undefined;
  }
  const letters = chars.filter((char) => !isOpenChar(char)).length;
  return letters >= 2 && normalizeWord(text).length > 0 ? text : undefined;
}

export function isOpenChar(char: string): boolean {
  return char === " " || char === "-" || char === "'";
}

export function hintMask(word: string): string {
  return [...word].map((char) => (isOpenChar(char) ? char : "_")).join("");
}

export function letterCount(word: string): number {
  return [...word].filter((char) => !isOpenChar(char)).length;
}

export function maxReveals(word: string): number {
  return Math.min(2, Math.floor(letterCount(word) / 3));
}
