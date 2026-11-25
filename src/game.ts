import { defineGame, int, text, type CatalogOf, type GameState, type PlayerId, type Random, type TickProfileWriter } from "@gamehearth/sdk";
import manifest from "../manifest.json";
import { cleanOwnWord, hintMask, isOpenChar, judgeGuess, maxGuessLength, maxReveals, normalizeWord } from "./guess";
import { canonicalPoints, chunkPoints, colorCount, countFills, cutPicture, fillMark, inkUsed, maxFills, maxInk, pictureTail, pointChars, strokeMark, styleChar, styleCount } from "./picture";
import { splitEntry, wordList, type Level, type WordLanguage } from "./words";

export const ticksPerSecond = 20;
export const tickMillis = 50;
export const wordsSeconds = 45;
export const chooseSeconds = 15;
export const revealSeconds = 5;
export const maxOwnWords = 3;
export const ownWordInputLength = 30;
export const feedLimit = 30;
export const privateFeedLimit = 20;
export const doubledFactors: Record<Level, number> = { 0: 2, 1: 3, 2: 4 };
export const drawerPointsPerGuess = 30;

export type Phase = "words" | "choose" | "draw" | "reveal" | "end";
export type TurnEnd = "time" | "all" | "pass";

export interface Word {
  text: string;
  alts: string[];
  level: Level;
  authors: PlayerId[];
}

export type Entry =
  | { n: number; p: number; kind: "miss"; by: PlayerId; text: string }
  | { n: number; p: number; kind: "hit"; by: PlayerId }
  | { n: number; p: number; kind: "near"; by: PlayerId; text: string }
  | { n: number; p: number; kind: "long"; by: PlayerId; text: string };

export interface Chat {
  n: number;
  p: number;
  by: PlayerId;
  text: string;
}

export interface Public {
  phase: Phase;
  ticksLeft: number;
  phaseTicks: number;
  drawTicks: number;
  rounds: number;
  round: number;
  order: PlayerId[];
  turn: number;
  drawer: PlayerId | null;
  authors: PlayerId[];
  hint: string;
  guessed: PlayerId[];
  scores: Record<PlayerId, number>;
  gained: Record<PlayerId, number>;
  feed: Entry[];
  seq: number;
  pic: string;
  ops: number;
  word: string | null;
  ended: TurnEnd | null;
  wordCount: Record<PlayerId, number>;
  done: PlayerId[];
}

export interface Me {
  ownWords: string[];
  choices: Word[];
  word: Word | null;
  feed: Entry[];
  chat: Chat[];
  solved: string[];
}

export interface Secret {
  pool: Word[];
  used: number[][];
  fastest: Record<PlayerId, number>;
  hits: Record<PlayerId, number>;
  seq: number;
}

export type KritzelState = GameState<Public, Me, Secret>;

export type KritzelAction =
  | { type: "word"; text: string }
  | { type: "drop"; index: number }
  | { type: "done" }
  | { type: "choose"; pick: number }
  | { type: "stroke"; op: number; at: number; style: number; points: string }
  | { type: "fill"; op: number; color: number; point: string }
  | { type: "cut"; keep: number }
  | { type: "pass" }
  | { type: "guess"; text: string }
  | { type: "chat"; text: string };

export interface Options {
  rounds: 1 | 2 | 3 | 4;
  drawTime: 60 | 80 | 100 | 120;
  wordLanguage: WordLanguage;
  ownWords: boolean;
}

export type Ids = CatalogOf<typeof manifest>;

interface TurnContext {
  players: readonly PlayerId[];
  random: Random;
  options: Options;
}

export function guessPoints(level: Level, ticksLeft: number, drawTicks: number): number {
  const base = 50 + Math.floor((100 * ticksLeft) / drawTicks);
  return Math.round((base * doubledFactors[level]) / 2);
}

export function drawerPoints(level: Level): number {
  return Math.round((drawerPointsPerGuess * doubledFactors[level]) / 2);
}

export function leaders(scores: Record<PlayerId, number>): PlayerId[] {
  const entries = Object.entries(scores);
  const best = Math.max(...entries.map(([, score]) => score));
  return best <= 0 ? [] : entries.filter(([, score]) => score === best).map(([seat]) => seat);
}

export function guessers(view: Public, players: readonly PlayerId[]): PlayerId[] {
  return players.filter((player) => player !== view.drawer && !view.authors.includes(player));
}

export function isInsider(view: Public, player: PlayerId): boolean {
  return player === view.drawer || view.authors.includes(player) || view.guessed.includes(player);
}

function emptyMe(): Me {
  return { ownWords: [], choices: [], word: null, feed: [], chat: [], solved: [] };
}

function pushEntry<T>(list: T[], entry: T, limit: number): void {
  list.push(entry);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function nextNumber(view: Public): { n: number; p: number } {
  view.seq += 1;
  return { n: view.seq, p: 0 };
}

function privateNumber(state: KritzelState): { n: number; p: number } {
  state.secret.seq += 1;
  return { n: state.public.seq, p: state.secret.seq };
}

function drawerWord(state: KritzelState): Word | null {
  const drawer = state.public.drawer;
  return drawer === null ? null : (state.players[drawer]?.word ?? null);
}

function drawListWord(state: KritzelState, level: Level, random: Random, language: WordLanguage): Word {
  const list = wordList(language, level);
  const used = state.secret.used[level] ?? [];
  if (used.length >= list.length) {
    used.length = 0;
  }
  const free: number[] = [];
  for (let index = 0; index < list.length; index++) {
    if (!used.includes(index)) {
      free.push(index);
    }
  }
  const index = random.pick(free);
  used.push(index);
  state.secret.used[level] = used;
  const { text: word, alts } = splitEntry(list[index] ?? "");
  return { text: word, alts, level, authors: [] };
}

function ownWordFor(state: KritzelState, drawer: PlayerId, random: Random, players: readonly PlayerId[]): Word | undefined {
  const candidates = state.secret.pool.filter(
    (word) => !word.authors.includes(drawer) && players.some((player) => player !== drawer && !word.authors.includes(player)),
  );
  if (candidates.length === 0) {
    return undefined;
  }
  const word = random.pick(candidates);
  state.secret.pool.splice(state.secret.pool.indexOf(word), 1);
  return word;
}

function startTurn(state: KritzelState, ctx: TurnContext): void {
  const view = state.public;
  const drawer = view.order[view.turn] ?? view.order[0] ?? null;
  view.phase = "choose";
  view.ticksLeft = chooseSeconds * ticksPerSecond;
  view.phaseTicks = view.ticksLeft;
  view.drawer = drawer;
  view.authors = [];
  view.hint = "";
  view.guessed = [];
  view.gained = {};
  view.feed = [];
  view.pic = "";
  view.ops = 0;
  view.word = null;
  view.ended = null;
  for (const player of ctx.players) {
    const me = state.players[player];
    if (me !== undefined) {
      me.feed = [];
      me.chat = [];
      me.solved = [];
      me.choices = [];
      me.word = null;
    }
  }
  state.secret.seq = 0;
  if (drawer === null) {
    return;
  }
  const language = ctx.options.wordLanguage;
  const easy = drawListWord(state, 0, ctx.random, language);
  const middle = ownWordFor(state, drawer, ctx.random, ctx.players) ?? drawListWord(state, 1, ctx.random, language);
  const hard = drawListWord(state, 2, ctx.random, language);
  const me = state.players[drawer];
  if (me !== undefined) {
    me.choices = [easy, middle, hard];
  }
}

function choose(state: KritzelState, pick: number): void {
  const view = state.public;
  const me = view.drawer === null ? undefined : state.players[view.drawer];
  const word = me?.choices[pick] ?? me?.choices[0];
  if (me === undefined || word === undefined) {
    return;
  }
  me.choices = [];
  me.word = word;
  view.phase = "draw";
  view.ticksLeft = view.drawTicks;
  view.phaseTicks = view.drawTicks;
  view.authors = [...word.authors];
  view.hint = hintMask(word.text);
  for (const author of word.authors) {
    const own = state.players[author];
    if (own !== undefined) {
      own.solved = [...word.text];
    }
  }
}

function endTurn(state: KritzelState, reason: TurnEnd): void {
  const view = state.public;
  const me = view.drawer === null ? undefined : state.players[view.drawer];
  view.word = me?.word?.text ?? null;
  if (me !== undefined) {
    me.word = null;
  }
  for (const other of Object.values(state.players)) {
    other.solved = [];
  }
  view.phase = "reveal";
  view.ticksLeft = revealSeconds * ticksPerSecond;
  view.phaseTicks = view.ticksLeft;
  view.ended = reason;
}

function finish(state: KritzelState, players: readonly PlayerId[], profile: TickProfileWriter<Ids>): void {
  const view = state.public;
  view.phase = "end";
  view.ticksLeft = 0;
  view.phaseTicks = 0;
  view.drawer = null;
  for (const winner of leaders(view.scores)) {
    profile.stat(winner, "siege", 1);
  }
  for (const player of players) {
    const score = view.scores[player] ?? 0;
    if (score > 0) {
      profile.record(player, "punkterekord", score);
    }
    const hits = state.secret.hits[player] ?? 0;
    if (hits > 0) {
      profile.stat(player, "erraten", hits);
    }
    const fastest = state.secret.fastest[player];
    if (fastest !== undefined) {
      profile.record(player, "schnellster-treffer", fastest);
    }
  }
}

function nextTurn(state: KritzelState, ctx: TurnContext & { profile: TickProfileWriter<Ids> }): void {
  const view = state.public;
  view.turn += 1;
  if (view.turn >= view.order.length) {
    view.turn = 0;
    view.round += 1;
  }
  if (view.round > view.rounds) {
    finish(state, ctx.players, ctx.profile);
    return;
  }
  startTurn(state, ctx);
}

function markListWordsUsed(state: KritzelState, keys: readonly string[], language: WordLanguage): void {
  for (const level of [0, 1, 2] as const) {
    const used = state.secret.used[level] ?? [];
    wordList(language, level).forEach((entry, index) => {
      if (!used.includes(index) && entry.split("|").some((variant) => keys.includes(normalizeWord(variant, language)))) {
        used.push(index);
      }
    });
    state.secret.used[level] = used;
  }
}

function beginAfterWords(state: KritzelState, ctx: TurnContext): void {
  const pool: Word[] = [];
  const keys: string[] = [];
  for (const player of ctx.players) {
    const me = state.players[player];
    if (me === undefined) {
      continue;
    }
    for (const word of me.ownWords) {
      const key = normalizeWord(word, ctx.options.wordLanguage);
      const known = pool[keys.indexOf(key)];
      if (known === undefined) {
        keys.push(key);
        pool.push({ text: word, alts: [], level: 1, authors: [player] });
      } else if (!known.authors.includes(player)) {
        known.authors.push(player);
      }
    }
    me.ownWords = [];
  }
  markListWordsUsed(state, keys, ctx.options.wordLanguage);
  state.secret.pool = ctx.random.shuffle(pool);
  state.public.wordCount = {};
  state.public.done = [];
  startTurn(state, ctx);
}

function revealLetter(state: KritzelState, random: Random): void {
  const word = drawerWord(state);
  if (word === null) {
    return;
  }
  const chars = [...word.text];
  const hint = [...state.public.hint];
  const shown = hint.filter((char, index) => char !== "_" && !isOpenChar(chars[index] ?? " ")).length;
  const hidden = hint.map((char, index) => (char === "_" ? index : -1)).filter((index) => index >= 0);
  if (shown >= maxReveals(word.text) || hidden.length === 0) {
    return;
  }
  const index = random.pick(hidden);
  hint[index] = chars[index] ?? "_";
  state.public.hint = hint.join("");
}

function award(view: Public, player: PlayerId, points: number): void {
  view.scores[player] = (view.scores[player] ?? 0) + points;
  view.gained[player] = (view.gained[player] ?? 0) + points;
}

function guess(state: KritzelState, player: PlayerId, typed: string, players: readonly PlayerId[], language: WordLanguage): void {
  const view = state.public;
  const word = drawerWord(state);
  if (word === null || view.drawer === null || typed.trim().length === 0) {
    return;
  }
  const verdict = judgeGuess(typed, [word.text, ...word.alts], language);
  if (verdict === "miss") {
    pushEntry(view.feed, { ...nextNumber(view), kind: "miss", by: player, text: typed }, feedLimit);
    return;
  }
  const me = state.players[player];
  if (verdict === "near" || verdict === "long") {
    if (me !== undefined) {
      pushEntry(me.feed, { ...privateNumber(state), kind: verdict, by: player, text: typed }, privateFeedLimit);
    }
    return;
  }
  if (me !== undefined) {
    me.solved = [...word.text];
  }
  award(view, player, guessPoints(word.level, view.ticksLeft, view.drawTicks));
  award(view, view.drawer, drawerPoints(word.level));
  view.guessed.push(player);
  pushEntry(view.feed, { ...nextNumber(view), kind: "hit", by: player }, feedLimit);
  state.secret.hits[player] = (state.secret.hits[player] ?? 0) + 1;
  const millis = (view.drawTicks - view.ticksLeft + 1) * tickMillis;
  const fastest = state.secret.fastest[player];
  state.secret.fastest[player] = fastest === undefined ? millis : Math.min(fastest, millis);
  if (guessers(view, players).every((seat) => view.guessed.includes(seat))) {
    endTurn(state, "all");
  }
}

function chat(state: KritzelState, player: PlayerId, typed: string, players: readonly PlayerId[]): void {
  const view = state.public;
  if (typed.trim().length === 0) {
    return;
  }
  const { n, p } = privateNumber(state);
  for (const seat of players) {
    const me = state.players[seat];
    if (me !== undefined && isInsider(view, seat)) {
      pushEntry(me.chat, { n, p, by: player, text: typed }, privateFeedLimit);
    }
  }
}

function addStroke(view: Public, action: Extract<KritzelAction, { type: "stroke" }>): void {
  const left = maxInk - inkUsed(view.pic, view.ops);
  if (action.op === view.ops && action.at === 0) {
    const points = canonicalPoints(action.points, left);
    if (points.length > 0) {
      view.pic += `${strokeMark}${styleChar(action.style)}${points}`;
      view.ops += 1;
    }
    return;
  }
  const tail = pictureTail(view.pic, view.ops);
  if (action.op === view.ops - 1 && tail.kind === "stroke" && tail.style === action.style && action.at === tail.points) {
    view.pic += canonicalPoints(action.points, left);
  }
}

function addFill(view: Public, action: Extract<KritzelAction, { type: "fill" }>): void {
  const left = maxInk - inkUsed(view.pic, view.ops);
  const point = canonicalPoints(action.point, 1);
  if (action.op === view.ops && left >= 1 && point.length === 4 && countFills(view.pic) < maxFills) {
    view.pic += `${fillMark}${styleChar(action.color)}${point}`;
    view.ops += 1;
  }
}

function drawerMoves(): KritzelAction[] {
  return [
    {
      type: "stroke",
      op: int({ min: 0, max: maxInk }),
      at: int({ min: 0, max: maxInk }),
      style: int({ min: 0, max: styleCount - 1 }),
      points: text({ min: 4, max: chunkPoints * 4, chars: pointChars }),
    },
    { type: "fill", op: int({ min: 0, max: maxInk }), color: int({ min: 0, max: colorCount - 1 }), point: text({ min: 4, max: 4, chars: pointChars }) },
    { type: "cut", keep: int({ min: 0, max: maxInk }) },
    { type: "pass" },
  ];
}

export const kritzelkiste = defineGame<KritzelState, KritzelAction, Options, Ids>({
  setup({ players, random, options }) {
    const order = random.shuffle(players);
    const state: KritzelState = {
      public: {
        phase: "choose",
        ticksLeft: 0,
        phaseTicks: 0,
        drawTicks: options.drawTime * ticksPerSecond,
        rounds: options.rounds,
        round: 1,
        order,
        turn: 0,
        drawer: null,
        authors: [],
        hint: "",
        guessed: [],
        scores: Object.fromEntries(players.map((player) => [player, 0])),
        gained: {},
        feed: [],
        seq: 0,
        pic: "",
        ops: 0,
        word: null,
        ended: null,
        wordCount: {},
        done: [],
      },
      players: Object.fromEntries(players.map((player) => [player, emptyMe()])),
      secret: { pool: [], used: [[], [], []], fastest: {}, hits: {}, seq: 0 },
    };
    if (options.ownWords && players.length >= 3) {
      state.public.phase = "words";
      state.public.ticksLeft = wordsSeconds * ticksPerSecond;
      state.public.phaseTicks = state.public.ticksLeft;
      state.public.wordCount = Object.fromEntries(players.map((player) => [player, 0]));
    } else {
      startTurn(state, { players, random, options });
    }
    return state;
  },

  legalMoves(state, player) {
    const view = state.public;
    if (view.phase === "words") {
      const me = state.players[player];
      if (me === undefined || view.done.includes(player)) {
        return [];
      }
      const moves: KritzelAction[] = [];
      if (me.ownWords.length < maxOwnWords) {
        moves.push({ type: "word", text: text({ min: 1, max: ownWordInputLength }) });
      }
      me.ownWords.forEach((_, index) => moves.push({ type: "drop", index }));
      moves.push({ type: "done" });
      return moves;
    }
    if (view.phase === "choose") {
      return player === view.drawer ? [0, 1, 2].map((pick): KritzelAction => ({ type: "choose", pick })) : [];
    }
    if (view.phase === "draw") {
      if (player === view.drawer) {
        return drawerMoves();
      }
      const typed = text({ min: 1, max: maxGuessLength });
      return [isInsider(view, player) ? { type: "chat", text: typed } : { type: "guess", text: typed }];
    }
    return [];
  },

  apply(state, action, { player, players, options }) {
    const view = state.public;
    const me = state.players[player];
    switch (action.type) {
      case "word": {
        const word = cleanOwnWord(action.text);
        if (me === undefined || word === undefined || me.ownWords.length >= maxOwnWords) {
          return;
        }
        const key = normalizeWord(word, options.wordLanguage);
        if (!me.ownWords.some((own) => normalizeWord(own, options.wordLanguage) === key)) {
          me.ownWords.push(word);
          view.wordCount[player] = me.ownWords.length;
        }
        return;
      }
      case "drop":
        if (me !== undefined) {
          me.ownWords.splice(action.index, 1);
          view.wordCount[player] = me.ownWords.length;
        }
        return;
      case "done":
        if (!view.done.includes(player)) {
          view.done.push(player);
        }
        return;
      case "choose":
        choose(state, action.pick);
        return;
      case "stroke":
        addStroke(view, action);
        return;
      case "fill":
        addFill(view, action);
        return;
      case "cut":
        if (action.keep < view.ops) {
          view.pic = cutPicture(view.pic, action.keep);
          view.ops = action.keep;
        }
        return;
      case "pass":
        endTurn(state, "pass");
        return;
      case "guess":
        guess(state, player, action.text, players, options.wordLanguage);
        return;
      case "chat":
        chat(state, player, action.text, players);
        return;
    }
  },

  tick(state, _dt, { players, random, options, profile }) {
    const view = state.public;
    if (view.phase === "end") {
      return;
    }
    view.ticksLeft = Math.max(0, view.ticksLeft - 1);
    const ctx = { players, random, options };
    if (view.phase === "words") {
      if (view.ticksLeft === 0 || players.every((player) => view.done.includes(player))) {
        beginAfterWords(state, ctx);
      }
      return;
    }
    if (view.phase === "choose") {
      if (view.ticksLeft === 0) {
        choose(state, random.int(0, 2));
      }
      return;
    }
    if (view.phase === "draw") {
      if (view.ticksLeft === Math.floor(view.drawTicks / 2) || view.ticksLeft === Math.floor(view.drawTicks / 4)) {
        revealLetter(state, random);
      }
      if (view.ticksLeft === 0) {
        endTurn(state, "time");
      }
      return;
    }
    if (view.ticksLeft === 0) {
      nextTurn(state, { ...ctx, profile });
    }
  },

  result(state) {
    return state.public.phase === "end" ? { winners: leaders(state.public.scores) } : undefined;
  },
});
