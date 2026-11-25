import { createMatch, stepMatch, tickMs, type Match, type ProfileChange } from "@gamehearth/sdk/platform";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import game, {
  chooseSeconds,
  drawerPoints,
  encodePoint,
  encodeStroke,
  guessPoints,
  maxInk,
  penStyle,
  revealSeconds,
  ticksPerSecond,
  wordList,
  wordsSeconds,
  type KritzelAction,
  type KritzelState,
  type Options,
  type Word,
} from "../src/index";

type KritzelMatch = Match<KritzelState, KritzelAction>;
type Input = { player: string; action: KritzelAction };

const defaults: Options = { rounds: 2, drawTime: 80, wordLanguage: "de", ownWords: false };

function start(players = 3, options: Partial<Options> = {}, seed = "kritzel"): KritzelMatch {
  const created = createMatch(game, { playerCount: players, seed, options: { ...defaults, ...options }, catalog: manifest });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.match;
}

function run(match: KritzelMatch, inputs: Input[] = [], ticks = 1): { match: KritzelMatch; changes: ProfileChange[]; results: { ok: boolean }[] } {
  let current = match;
  const changes: ProfileChange[] = [];
  let results: { ok: boolean }[] = [];
  for (let index = 0; index < ticks; index++) {
    const outcome = stepMatch(game, current, { inputs: index === 0 ? inputs : [], now: 0, dt: tickMs }, { catalog: manifest });
    if (!outcome.ok) {
      throw new Error(outcome.error.message);
    }
    if (index === 0) {
      results = outcome.results;
    }
    changes.push(...(outcome.changes ?? []));
    current = outcome.match;
    if (current.result !== undefined) {
      break;
    }
  }
  return { match: current, changes, results };
}

function step(match: KritzelMatch, inputs: Input[] = [], ticks = 1): KritzelMatch {
  return run(match, inputs, ticks).match;
}

function edit(match: KritzelMatch, change: (state: KritzelState) => void): KritzelMatch {
  const copy = JSON.parse(JSON.stringify(match)) as KritzelMatch;
  change(copy.state);
  return copy;
}

function word(text: string, level: 0 | 1 | 2 = 0, alts: string[] = [], authors: string[] = []): Word {
  return { text, alts, level, authors };
}

function drawer(match: KritzelMatch): string {
  const seat = match.state.public.drawer;
  if (seat === null) {
    throw new Error("nobody draws");
  }
  return seat;
}

function others(match: KritzelMatch): string[] {
  return match.players.filter((seat) => seat !== match.state.public.drawer);
}

function drawing(match: KritzelMatch, chosen: Word): KritzelMatch {
  const seat = drawer(match);
  const prepared = edit(match, (state) => {
    state.players[seat]!.choices = [chosen, word("Zwei", 1), word("Drei", 2)];
  });
  return step(prepared, [{ player: seat, action: { type: "choose", pick: 0 } }]);
}

function say(player: string, text: string): Input {
  return { player, action: { type: "guess", text } };
}

describe("Setup and choosing the word", () => {
  it("draws the order by lot, starts with choosing and offers the drawer one easy, one medium and one hard word", () => {
    const match = start(4);
    const view = match.state.public;
    expect([...view.order].sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(view.phase).toBe("choose");
    expect(view.drawer).toBe(view.order[0]);
    expect(view.ticksLeft).toBe(chooseSeconds * ticksPerSecond);
    expect(match.state.players[drawer(match)]!.choices.map((choice) => choice.level)).toEqual([0, 1, 2]);
    for (const seat of others(match)) {
      expect(match.state.players[seat]!.choices).toEqual([]);
    }
    expect(view.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("takes the words from the list in the word language of the options", () => {
    const german = start(2, { wordLanguage: "de" });
    const english = start(2, { wordLanguage: "en" });
    const choiceIn = (match: KritzelMatch, language: "de" | "en") =>
      match.state.players[drawer(match)]!.choices.every((choice) =>
        wordList(language, choice.level).some((entry) => entry.split("|")[0] === choice.text),
      );
    expect(choiceIn(german, "de")).toBe(true);
    expect(choiceIn(english, "en")).toBe(true);
  });

  it("starts drawing with the picked word, shows everyone only the boxes and gives the others guess moves", () => {
    const match = drawing(start(3), word("Hula-Hoop Reifen", 2));
    const view = match.state.public;
    expect(view.phase).toBe("draw");
    expect(view.hint).toBe("____-____ ______");
    expect(view.ticksLeft).toBe(80 * ticksPerSecond - 1);
    expect(match.state.players[drawer(match)]!.word?.text).toBe("Hula-Hoop Reifen");
    expect(match.state.players[drawer(match)]!.choices).toEqual([]);
    for (const seat of others(match)) {
      expect(match.moves[seat]?.map((move) => move.type)).toEqual(["guess"]);
    }
    expect(match.moves[drawer(match)]?.map((move) => move.type)).toEqual(["stroke", "fill", "cut", "pass"]);
  });

  it("picks one of the three words itself after 15 seconds", () => {
    const match = step(start(2), [], chooseSeconds * ticksPerSecond);
    expect(match.state.public.phase).toBe("draw");
    expect(match.state.players[drawer(match)]!.word).not.toBeNull();
  });

  it("takes the drawing time from the options", () => {
    expect(start(2, { drawTime: 60 }).state.public.drawTicks).toBe(60 * ticksPerSecond);
    expect(start(2, { drawTime: 120 }).state.public.drawTicks).toBe(120 * ticksPerSecond);
  });
});

describe("Guessing", () => {
  it("gives the guesser 150 points right away and the drawer 30, and never shows the correct word as text", () => {
    let match = drawing(start(3, {}, "points"), word("Leuchtturm", 0));
    const [first] = others(match);
    match = edit(match, (state) => {
      state.public.ticksLeft = state.public.drawTicks;
    });
    match = step(match, [say(first!, "  leuchtturm ")]);
    const view = match.state.public;
    expect(view.scores[first!]).toBe(150);
    expect(view.scores[drawer(match)]).toBe(30);
    expect(view.guessed).toEqual([first]);
    expect(view.feed).toEqual([{ n: 1, p: 0, kind: "hit", by: first }]);
    expect(JSON.stringify(view)).not.toContain("euchtturm");
    expect(match.moves[first!]?.map((move) => move.type)).toEqual(["chat"]);
  });

  it("gives fewer points the later the guess comes, about 50 in the last second", () => {
    expect(guessPoints(0, 1600, 1600)).toBe(150);
    expect(guessPoints(0, 800, 1600)).toBe(100);
    expect(guessPoints(0, 10, 1600)).toBe(50);
  });

  it("multiplies the points by 1, 1.5 and 2 by difficulty", () => {
    expect([0, 1, 2].map((level) => guessPoints(level as 0 | 1 | 2, 1600, 1600))).toEqual([150, 225, 300]);
    expect([0, 1, 2].map((level) => drawerPoints(level as 0 | 1 | 2))).toEqual([30, 45, 60]);
  });

  it("accepts umlaut spellings, case, spaces and alternatives", () => {
    const base = drawing(start(4, {}, "spelling"), word("Fahrrad", 1, ["Rad"]));
    const [a, b, c] = others(base);
    const match = step(base, [say(a!, "FAHR RAD"), say(b!, "rad"), say(c!, "Fahrräder")]);
    expect(match.state.public.guessed).toEqual([a, b]);
    const umlaut = drawing(start(2, {}, "umlaut"), word("Schlüssel"));
    const [guesser] = others(umlaut);
    expect(step(umlaut, [say(guesser!, "schluessel")]).state.public.guessed).toEqual([guesser]);
  });

  it("shows a wrong guess to everyone but a close guess only to the guesser", () => {
    const base = drawing(start(3, {}, "near"), word("Leuchtturm"));
    const [a, b] = others(base);
    const match = step(base, [say(a!, "Leuchtturn"), say(b!, "Kerze")]);
    expect(match.state.public.feed).toEqual([{ n: 1, p: 0, kind: "miss", by: b, text: "Kerze" }]);
    expect(match.state.players[a!]!.feed).toEqual([{ n: 0, p: 1, kind: "near", by: a, text: "Leuchtturn" }]);
    expect(match.state.players[b!]!.feed).toEqual([]);
    expect(match.state.players[drawer(match)]!.feed).toEqual([]);
  });

  it("lets only those who know the word read what someone who guessed writes", () => {
    const base = drawing(start(4, {}, "chat"), word("Igel"));
    const [a, b, c] = others(base);
    let match = step(base, [say(a!, "Igel")]);
    match = step(match, [{ player: a!, action: { type: "chat", text: "Schön gemalt!" } }]);
    const entry = { n: 1, p: 1, by: a, text: "Schön gemalt!" };
    expect(match.state.players[a!]!.chat).toEqual([entry]);
    expect(match.state.players[drawer(match)]!.chat).toEqual([entry]);
    expect(match.state.players[b!]!.chat).toEqual([]);
    expect(match.state.players[c!]!.chat).toEqual([]);
    expect(match.state.public.feed).toEqual([{ n: 1, p: 0, kind: "hit", by: a }]);
  });

  it("ends the turn at once when everyone has guessed and then shows the word for 5 seconds", () => {
    const base = drawing(start(3, {}, "all"), word("Igel"));
    const [a, b] = others(base);
    const match = step(base, [say(a!, "igel"), say(b!, "Igel")]);
    const view = match.state.public;
    expect(view.phase).toBe("reveal");
    expect(view.ended).toBe("all");
    expect(view.word).toBe("Igel");
    expect(match.state.players[drawer(match)]!.word).toBeNull();
    expect(view.ticksLeft).toBe(revealSeconds * ticksPerSecond - 1);
    expect(view.gained[drawer(match)]).toBe(60);
  });

  it("ends the turn when the drawing time is up", () => {
    const base = drawing(start(2, { drawTime: 60 }, "time"), word("Igel"));
    const match = step(base, [], 60 * ticksPerSecond);
    expect(match.state.public.phase).toBe("reveal");
    expect(match.state.public.ended).toBe("time");
  });

  it("lets the drawer give up, which ends the turn", () => {
    const base = drawing(start(3, {}, "pass"), word("Igel"));
    const match = step(base, [{ player: drawer(base), action: { type: "pass" } }]);
    expect(match.state.public.phase).toBe("reveal");
    expect(match.state.public.ended).toBe("pass");
    expect(match.state.public.word).toBe("Igel");
  });
});

describe("Hints", () => {
  it("reveals one letter at half and one at three quarters of the drawing time", () => {
    let match = drawing(start(2, { drawTime: 60 }, "hint"), word("Leuchtturm"));
    const half = 30 * ticksPerSecond;
    match = step(match, [], match.state.public.ticksLeft - half - 1);
    expect(match.state.public.hint).toBe("__________");
    match = step(match, [], 1);
    const once = match.state.public.hint;
    expect(once.replaceAll("_", "")).toHaveLength(1);
    expect("Leuchtturm".includes(once.replaceAll("_", ""))).toBe(true);
    match = step(match, [], 15 * ticksPerSecond);
    expect(match.state.public.hint.replaceAll("_", "")).toHaveLength(2);
  });

  it("never reveals more than a third of the letters", () => {
    let short = drawing(start(2, { drawTime: 60 }, "short"), word("Ei"));
    short = step(short, [], 50 * ticksPerSecond);
    expect(short.state.public.hint).toBe("__");
    let three = drawing(start(2, { drawTime: 60 }, "three"), word("Hut"));
    three = step(three, [], 50 * ticksPerSecond);
    expect(three.state.public.hint.replaceAll("_", "")).toHaveLength(1);
  });
});

describe("Turns, rounds and the end", () => {
  it("lets everyone draw once per round and ends after the last round with the most points winning", () => {
    let match = start(3, { rounds: 1 }, "rounds");
    const drawers: string[] = [];
    for (let turn = 0; turn < 3; turn++) {
      drawers.push(drawer(match));
      match = drawing(match, word("Igel"));
      match = step(match, [{ player: drawer(match), action: { type: "pass" } }]);
      expect(match.state.public.phase).toBe("reveal");
      match = step(match, [], revealSeconds * ticksPerSecond - 1);
    }
    expect([...drawers].sort()).toEqual(["p1", "p2", "p3"]);
    expect(match.state.public.phase).toBe("end");
    expect(match.result).toEqual({ winners: [] });
  });

  it("names several winners on a tie and writes wins, records and counters into the profiles at the end", () => {
    let match = drawing(start(3, { rounds: 1 }, "end"), word("Igel"));
    const [a, b] = others(match);
    match = edit(match, (state) => {
      state.public.turn = 2;
      state.public.ticksLeft = state.public.drawTicks;
    });
    match = step(match, [say(a!, "Igel"), { player: drawer(match), action: { type: "pass" } }]);
    expect(match.state.public.phase).toBe("reveal");
    match = edit(match, (state) => {
      state.public.scores = { p1: 300, p2: 300, p3: 100 };
      state.public.scores[a!] = 300;
    });
    const scores = match.state.public.scores;
    const outcome = run(match, [], revealSeconds * ticksPerSecond);
    expect(outcome.match.result).toBeDefined();
    const best = Math.max(...Object.values(scores));
    expect(outcome.match.result?.winners).toEqual(Object.keys(scores).filter((seat) => scores[seat] === best));
    expect(outcome.changes).toContainEqual({ player: a, op: "stat", id: "erraten", value: 1 });
    expect(outcome.changes).toContainEqual({ player: a, op: "record", id: "schnellster-treffer", value: 50 });
    expect(outcome.changes).toContainEqual({ player: a, op: "record", id: "punkterekord", value: 300 });
    for (const winner of outcome.match.result?.winners ?? []) {
      expect(outcome.changes).toContainEqual({ player: winner, op: "stat", id: "siege", value: 1 });
    }
    expect(outcome.changes.filter((change) => change.player === b && change.id === "erraten")).toEqual([]);
  });

  it("accepts no more inputs after the end", () => {
    let match = start(2, { rounds: 1 }, "over");
    for (let turn = 0; turn < 2; turn++) {
      match = drawing(match, word("Igel"));
      match = step(match, [{ player: drawer(match), action: { type: "pass" } }], revealSeconds * ticksPerSecond);
    }
    expect(match.result).toBeDefined();
    expect(match.moves).toEqual({ p1: [], p2: [] });
  });
});

describe("Drawing", () => {
  const style = penStyle(2, 1);

  function stroke(op: number, at: number, points: string, by: string): Input {
    return { player: by, action: { type: "stroke", op, at, style, points } };
  }

  it("stores strokes as compact text that only grows at the end", () => {
    let match = drawing(start(2, {}, "draw"), word("Igel"));
    const seat = drawer(match);
    const a = encodePoint(10, 20) + encodePoint(30, 40);
    const b = encodePoint(50, 60);
    match = step(match, [stroke(0, 0, a, seat)]);
    expect(match.state.public.pic).toBe(encodeStroke(style, [10, 20, 30, 40]));
    match = step(match, [stroke(0, 2, b, seat)]);
    expect(match.state.public.pic).toBe(encodeStroke(style, [10, 20, 30, 40, 50, 60]));
    expect(match.state.public.ops).toBe(1);
  });

  it("ignores repeated or out-of-order pieces, so a piece sent twice is drawn once", () => {
    let match = drawing(start(2, {}, "dupe"), word("Igel"));
    const seat = drawer(match);
    const a = encodePoint(10, 20);
    match = step(match, [stroke(0, 0, a, seat), stroke(0, 0, a, seat), stroke(0, 5, a, seat), stroke(3, 0, a, seat)]);
    expect(match.state.public.pic).toBe(encodeStroke(style, [10, 20]));
  });

  it("fills, undoes the last step and clears", () => {
    let match = drawing(start(2, {}, "tools"), word("Igel"));
    const seat = drawer(match);
    match = step(match, [stroke(0, 0, encodePoint(1, 1), seat), { player: seat, action: { type: "fill", op: 1, color: 4, point: encodePoint(5, 5) } }]);
    expect(match.state.public.ops).toBe(2);
    match = step(match, [{ player: seat, action: { type: "cut", keep: 1 } }]);
    expect(match.state.public.pic).toBe(encodeStroke(style, [1, 1]));
    match = step(match, [{ player: seat, action: { type: "cut", keep: 0 } }]);
    expect(match.state.public).toMatchObject({ pic: "", ops: 0 });
  });

  it("clamps points to the picture and copes with any text the placeholder allows", () => {
    let match = drawing(start(2, {}, "garbage"), word("Igel"));
    const seat = drawer(match);
    match = step(match, [stroke(0, 0, "______", seat)]);
    expect(match.state.public.pic).toBe(encodeStroke(style, [599, 599]));
  });

  it("stops at about 6000 points per picture", () => {
    let match = drawing(start(2, {}, "full"), word("Igel"));
    const seat = drawer(match);
    match = edit(match, (state) => {
      state.public.pic = encodeStroke(style, new Array((maxInk - 1) * 2).fill(3));
      state.public.ops = 1;
    });
    match = step(match, [stroke(0, maxInk - 1, encodePoint(1, 1) + encodePoint(2, 2), seat)]);
    expect((match.state.public.pic.length - 2) / 4).toBe(maxInk);
  });
});

describe("Own words", () => {
  it("lets everyone write up to three words first and starts when everyone is done", () => {
    let match = start(3, { ownWords: true }, "own");
    expect(match.state.public.phase).toBe("words");
    expect(match.state.public.ticksLeft).toBe(wordsSeconds * ticksPerSecond);
    match = step(match, [
      { player: "p1", action: { type: "word", text: " Zahnfee " } },
      { player: "p1", action: { type: "word", text: "zahnfee" } },
      { player: "p1", action: { type: "word", text: "😀" } },
      { player: "p2", action: { type: "word", text: "Wolkenkratzer" } },
    ]);
    expect(match.state.players["p1"]!.ownWords).toEqual(["Zahnfee"]);
    expect(match.state.public.wordCount).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(JSON.stringify(match.state.public)).not.toContain("Zahnfee");
    match = step(match, ["p1", "p2", "p3"].map((player) => ({ player, action: { type: "done" } as KritzelAction })));
    expect(match.state.public.phase).toBe("choose");
    expect(match.state.players["p1"]!.ownWords).toEqual([]);
  });

  it("starts after 45 seconds even if not everyone is done", () => {
    const match = step(start(3, { ownWords: true }, "late"), [], wordsSeconds * ticksPerSecond);
    expect(match.state.public.phase).toBe("choose");
  });

  it("offers own words of others as the middle choice and never to their author", () => {
    let match = start(3, { ownWords: true }, "middle");
    match = step(match, [
      { player: "p1", action: { type: "word", text: "Zahnfee" } },
      { player: "p2", action: { type: "word", text: "Wolkenkratzer" } },
      { player: "p3", action: { type: "word", text: "Schneckenhaus" } },
    ]);
    match = step(match, [], wordsSeconds * ticksPerSecond);
    const seat = drawer(match);
    const middle = match.state.players[seat]!.choices[1]!;
    expect(middle.authors).toHaveLength(1);
    expect(middle.authors).not.toContain(seat);
    expect(middle.level).toBe(1);
  });

  it("counts the author as having guessed: no guessing, no points, but chatting", () => {
    let match = start(3, { ownWords: true }, "author");
    match = step(match, [], wordsSeconds * ticksPerSecond);
    const seat = drawer(match);
    const author = others(match)[0]!;
    const [other] = others(match).filter((player) => player !== author);
    match = drawing(match, word("Zahnfee", 1, [], [author]));
    expect(match.state.public.authors).toEqual([author]);
    expect(match.moves[author]?.map((move) => move.type)).toEqual(["chat"]);
    match = step(match, [say(other!, "Zahnfee")]);
    expect(match.state.public.phase).toBe("reveal");
    expect(match.state.public.scores[author]).toBe(0);
    expect(match.state.public.scores[seat]).toBe(drawerPoints(1));
  });

  it("skips the own words with only two players, because nobody would be left to guess", () => {
    expect(start(2, { ownWords: true }).state.public.phase).toBe("choose");
  });
});
