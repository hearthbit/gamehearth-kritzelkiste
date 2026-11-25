import { createMatch, stepMatch, tickMs, type Match, type ProfileChange } from "@gamehearth/sdk/platform";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import { DrawerSync } from "../client/src/sync";
import { texts } from "../client/src/texts";
import * as view from "../client/src/view";
import game, {
  cleanOwnWord,
  encodeFill,
  encodePoint,
  judgeGuess,
  normalizeWord,
  penStyle,
  revealSeconds,
  ticksPerSecond,
  wordList,
  wordsSeconds,
  type KritzelAction,
  type KritzelState,
  type Options,
  type Public,
} from "../src/index";

type KritzelMatch = Match<KritzelState, KritzelAction>;
type Input = { player: string; action: KritzelAction };

const defaults: Options = { rounds: 2, drawTime: 80, wordLanguage: "de", ownWords: false };
const wordsTicks = wordsSeconds * ticksPerSecond;
const revealTicks = revealSeconds * ticksPerSecond;

function start(players: number, options: Partial<Options>, seed: string): KritzelMatch {
  const created = createMatch(game, { playerCount: players, seed, options: { ...defaults, ...options }, catalog: manifest });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.match;
}

function run(match: KritzelMatch, inputs: Input[] = [], ticks = 1): { match: KritzelMatch; changes: ProfileChange[] } {
  let current = match;
  const changes: ProfileChange[] = [];
  for (let index = 0; index < ticks; index++) {
    const outcome = stepMatch(game, current, { inputs: index === 0 ? inputs : [], now: 0, dt: tickMs }, { catalog: manifest });
    if (!outcome.ok) {
      throw new Error(outcome.error.message);
    }
    changes.push(...(outcome.changes ?? []));
    current = outcome.match;
    if (current.result !== undefined) {
      break;
    }
  }
  return { match: current, changes };
}

function step(match: KritzelMatch, inputs: Input[] = [], ticks = 1): KritzelMatch {
  return run(match, inputs, ticks).match;
}

function edit(match: KritzelMatch, change: (state: KritzelState) => void): KritzelMatch {
  const copy = JSON.parse(JSON.stringify(match)) as KritzelMatch;
  change(copy.state);
  return copy;
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

function own(player: string, text: string): Input {
  return { player, action: { type: "word", text } };
}

function allDone(match: KritzelMatch): KritzelMatch {
  return step(match, match.players.map((player) => ({ player, action: { type: "done" } as KritzelAction })));
}

function say(player: string, text: string): Input {
  return { player, action: { type: "guess", text } };
}

function choose(match: KritzelMatch, pick: number): KritzelMatch {
  return step(match, [{ player: drawer(match), action: { type: "choose", pick } }]);
}

function drawing(match: KritzelMatch, text: string, level: 0 | 1 | 2 = 0, authors: string[] = []): KritzelMatch {
  const seat = drawer(match);
  const prepared = edit(match, (state) => {
    const chosen = { text, alts: [], level, authors };
    state.players[seat]!.choices = [chosen, chosen, chosen];
  });
  return choose(prepared, 0);
}

function finishTurn(match: KritzelMatch): KritzelMatch {
  let current = match;
  if (current.state.public.phase === "choose") {
    current = choose(current, 0);
  }
  return step(current, [{ player: drawer(current), action: { type: "pass" } }], revealTicks);
}

const isLighthouse = (text: string) => text.trim().toLowerCase() === "leuchtturm";

describe("Review fixes", () => {
  it("review 1: never offers an own word written by two players to either of them", () => {
    for (let index = 0; index < 20; index++) {
      let match = start(3, { ownWords: true }, `dup-${index}`);
      match = step(match, [own("p1", "Leuchtturm"), own("p2", "Leuchtturm")]);
      match = allDone(match);
      for (let turn = 0; turn < 3 && match.result === undefined; turn++) {
        const seat = drawer(match);
        const offered = match.state.players[seat]!.choices.some((choice) => isLighthouse(choice.text));
        expect(offered && (seat === "p1" || seat === "p2"), `seed dup-${index}: offered to ${seat}`).toBe(false);
        match = finishTurn(match);
      }
    }
  });

  it("review 1: counts every author of a shared own word as having guessed", () => {
    let found = false;
    for (let index = 0; index < 40 && !found; index++) {
      let match = start(4, { ownWords: true }, `dup4-${index}`);
      match = step(match, [own("p1", "Leuchtturm"), own("p2", "Leuchtturm ")]);
      match = allDone(match);
      for (let turn = 0; turn < 4 && !found; turn++) {
        const seat = drawer(match);
        if (isLighthouse(match.state.players[seat]!.choices[1]?.text ?? "")) {
          found = true;
          match = choose(match, 1);
          expect(match.moves["p1"]?.map((move) => move.type)).toEqual(["chat"]);
          expect(match.moves["p2"]?.map((move) => move.type)).toEqual(["chat"]);
          const [guesser] = others(match).filter((other) => other !== "p1" && other !== "p2");
          match = step(match, [say(guesser!, "Leuchtturm")]);
          expect(match.state.public.phase).toBe("reveal");
          expect([match.state.public.scores["p1"], match.state.public.scores["p2"]]).toEqual([0, 0]);
        } else {
          match = finishTurn(match);
        }
      }
    }
    expect(found).toBe(true);
  });

  it("review 2: a word inside a longer guess is only close if a whole word or two neighbouring words match", () => {
    expect(judgeGuess("elephant", ["ant"])).toBe("miss");
    expect(judgeGuess("plant", ["ant"])).toBe("miss");
    expect(judgeGuess("heart", ["ear"])).toBe("miss");
    expect(judgeGuess("Kreis", ["Eis", "Eiscreme"])).toBe("miss");
    expect(judgeGuess("Schutzhelm", ["Hut"])).toBe("miss");
    expect(judgeGuess("binoculars", ["bin", "trash can", "dustbin"])).toBe("miss");
    expect(judgeGuess("ein Leuchtturm", ["Leuchtturm"])).toBe("near");
    expect(judgeGuess("ein Leuchturm", ["Leuchtturm"])).toBe("near");
    expect(judgeGuess("der Leucht turm", ["Leuchtturm"])).toBe("near");
    expect(judgeGuess("Leucht turm", ["Leuchtturm"])).toBe("hit");
    expect(judgeGuess("message in a bottle", ["message in a bottle"])).toBe("hit");
    expect(judgeGuess("haus baum sonne mond stern ball", ["Mond"])).not.toBe("near");
    expect(judgeGuess("haus baum sonne mond stern ball", ["Mond"])).not.toBe("hit");
  });

  it("review 2: a guess with too many words is shown only to the guesser and gives nothing away", () => {
    const base = drawing(start(3, {}, "long"), "Mond");
    const [a] = others(base);
    const match = step(base, [say(a!, "haus baum sonne mond stern ball")]);
    expect(match.state.public.feed).toEqual([]);
    expect(match.state.players[a!]!.feed.map((entry) => entry.kind)).toEqual(["long"]);
  });

  it("review 3: numbers close guesses and the insiders' chat apart from the public notes", () => {
    const base = drawing(start(3, {}, "numbers"), "Leuchtturm");
    const [a, b] = others(base);
    let match = step(base, [say(a!, "Leuchtturn")]);
    expect(match.state.public.seq).toBe(0);
    match = step(match, [say(b!, "Turm")]);
    expect(match.state.public.seq).toBe(1);
    match = step(match, [say(a!, "Leuchtturm")]);
    match = step(match, [{ player: a!, action: { type: "chat", text: "schön!" } }]);
    expect(match.state.public.seq).toBe(2);
  });

  it("review 4: keeps the difficulty with the drawer instead of telling the guessers", () => {
    const match = drawing(start(3, {}, "level"), "Leuchtturm", 2);
    expect(Object.keys(match.state.public)).not.toContain("level");
    expect(match.state.players[drawer(match)]!.word?.level).toBe(2);
  });

  it("review 5: marks list words as used when someone wrote the same word", () => {
    let match = start(3, { ownWords: true }, "same");
    match = step(match, [own("p1", "Haus"), own("p2", "Rad")]);
    match = step(match, [], wordsTicks);
    const easy = wordList("de", 0);
    expect(match.state.secret.used[0]).toContain(easy.findIndex((entry) => entry === "Haus"));
    expect(match.state.secret.used[0]).toContain(easy.findIndex((entry) => entry.startsWith("Fahrrad|")));
  });

  it("review 6: draws the order by lot instead of only rotating the seats", () => {
    const seats = ["p1", "p2", "p3", "p4"];
    const rotations = seats.map((_, index) => [...seats.slice(index), ...seats.slice(0, index)].join());
    const orders = Array.from({ length: 30 }, (_, index) => start(4, {}, `order-${index}`).state.public.order.join());
    expect(orders.some((order) => !rotations.includes(order))).toBe(true);
  });

  it("review 7: counts typed characters for own words and compares Icelandic letters like the boxes show them", () => {
    expect(cleanOwnWord("ß")).toBeUndefined();
    expect(cleanOwnWord("Þór")).toBe("Þór");
    expect(judgeGuess("or", ["Þór"])).not.toBe("hit");
    expect(judgeGuess("Thor", ["Þór"])).toBe("hit");
    expect(judgeGuess("Odinn", ["Óðinn"])).toBe("hit");
  });

  it("review 8: allows at most 100 fills per picture, on the server and on the drawer's phone", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => encodeFill(index % 10, index, index)).join("");
    let match = drawing(start(2, {}, "fills"), "Igel");
    const seat = drawer(match);
    match = edit(match, (state) => {
      state.public.pic = hundred;
      state.public.ops = 100;
    });
    match = step(match, [{ player: seat, action: { type: "fill", op: 100, color: 1, point: encodePoint(300, 300) } }]);
    expect(match.state.public.ops).toBe(100);
    const sync = new DrawerSync();
    sync.start(hundred, 100);
    expect(sync.fill(1, 5, 5)).toBe(false);
  });

  it("review 9: waits before handing out the same piece again while the server does not move on", () => {
    const sync = new DrawerSync();
    sync.start("", 0);
    sync.begin(penStyle(2, 1), 1, 1);
    let sent = 0;
    for (let index = 0; index < 1000; index++) {
      if (sync.next("", 0, 7, 1000) !== undefined) {
        sent += 1;
      }
    }
    expect(sent).toBe(1);
    expect(sync.next("", 0, 7, 1400)).toBeDefined();
  });

  it("review 10: nobody wins and nobody gets a win when everyone ends with 0 points", () => {
    let match = start(2, { rounds: 1 }, "zero");
    const changes: ProfileChange[] = [];
    for (let turn = 0; turn < 2; turn++) {
      match = choose(match, 0);
      const outcome = run(match, [{ player: drawer(match), action: { type: "pass" } }], revealTicks);
      changes.push(...outcome.changes);
      match = outcome.match;
    }
    expect(match.result).toEqual({ winners: [] });
    expect(changes.filter((change) => change.id === "siege")).toEqual([]);
    expect(view.winnerLine([], "p1", {}, texts("de"))).toBe("Niemand gewinnt – keiner hat Punkte.");
  });

  it("review 11: shows the author which of their words is being drawn", () => {
    const base = start(3, {}, "author-word");
    const author = others(base)[0]!;
    const match = drawing(base, "Zahnfee", 1, [author]);
    expect(match.state.players[author]!.solved).toEqual([..."Zahnfee"]);
    expect(texts("de").authorNote("Zahnfee")).toBe("„Zahnfee“ ist dein Wort – du rätst diesmal nicht mit.");
  });

  it("review 12: names the English eraser first", () => {
    expect(wordList("en", 2)).toContain("eraser|rubber");
  });

  it("review 13: fills the boxes of a seat that has guessed, and only that seat, until the turn ends", () => {
    const base = drawing(start(3, {}, "solved"), "Leuchtturm");
    const [a, b] = others(base);
    let match = step(base, [say(a!, "leuchtturm")]);
    expect(match.state.players[a!]!.solved).toEqual([..."Leuchtturm"]);
    expect(match.state.players[b!]!.solved).toEqual([]);
    const solvedView = match.state.public as Public;
    expect(view.solution(solvedView, match.state.players[a!]!)).toBe("Leuchtturm");
    expect(view.solution(solvedView, match.state.players[b!]!)).toBeNull();
    match = step(match, [say(b!, "Leuchtturm")]);
    expect(match.state.public.phase).toBe("reveal");
    expect(match.state.players[a!]!.solved).toEqual([]);
  });

  it("review 14: shows a title for the answer instead of who is drawing during the reveal", () => {
    const base = drawing(start(3, {}, "headline"), "Igel");
    const ended = step(base, [{ player: drawer(base), action: { type: "pass" } }]);
    const players = { p1: { name: "Mia", connected: true, you: true }, p2: { name: "Oma", connected: true, you: false }, p3: { name: "Ben", connected: true, you: false } };
    expect(view.headline(ended.state.public, "p1", players, texts("de"))).toEqual({ strong: "Auflösung", rest: "" });
    expect(view.headline(ended.state.public, "p1", players, texts("en"))).toEqual({ strong: "The answer", rest: "" });
  });
});

describe("Acceptance on the platform", () => {
  it("treats ae, oe and ue like a, o and u only for German words, so an English swap is still close", () => {
    expect(judgeGuess("mosue", ["mouse"], "en")).toBe("near");
    expect(judgeGuess("mouse", ["mouse"], "en")).toBe("hit");
    expect(judgeGuess("glue", ["glue"], "en")).toBe("hit");
    expect(judgeGuess("Kaese", ["Käse"], "de")).toBe("hit");
    expect(judgeGuess("Kase", ["Käse"], "de")).toBe("hit");
    expect(normalizeWord("Feuer", "de")).toBe("feur");
    expect(normalizeWord("canoe", "en")).toBe("canoe");
  });
});
