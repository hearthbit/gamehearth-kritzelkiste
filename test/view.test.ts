import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import { Raster } from "../client/src/raster";
import { DrawerSync } from "../client/src/sync";
import { texts } from "../client/src/texts";
import {
  cellWidth,
  endedLine,
  farEnough,
  hintCells,
  hintLetters,
  inLead,
  nextLine,
  notes,
  podium,
  Playback,
  roleOf,
  seatColor,
  secondsLeft,
  sheetSize,
  standings,
  toPicture,
  turnRows,
  typingHeight,
  waitingFor,
  winnerLine,
} from "../client/src/view";
import { encodePoint, encodeStroke, maxInk, penStyle, planSync, type Public } from "../src/index";

const de = texts("de");
const en = texts("en");
const players = {
  p1: { name: "Mia", connected: true, you: true },
  p2: { name: "Oma", connected: true, you: false },
  p3: { name: "Ben", connected: true, you: false },
  p4: { name: "Jonas", connected: true, you: false },
};

function view(changes: Partial<Public> = {}): Public {
  return {
    phase: "draw",
    ticksLeft: 940,
    phaseTicks: 1600,
    drawTicks: 1600,
    rounds: 3,
    round: 2,
    order: ["p3", "p1", "p2", "p4"],
    turn: 0,
    drawer: "p3",
    authors: [],
    hint: "__u_______",
    guessed: [],
    scores: { p1: 240, p2: 210, p3: 180, p4: 90 },
    gained: {},
    feed: [],
    seq: 0,
    pic: "",
    ops: 0,
    word: null,
    ended: null,
    wordCount: {},
    done: [],
    ...changes,
  };
}

describe("Texts", () => {
  it("has a block for every language of the manifest, German first as the fallback", () => {
    expect(manifest.languages).toEqual(["de", "en"]);
    expect(texts("xx")).toBe(de);
    expect(texts("de-AT")).toBe(de);
    expect(texts("en-GB")).toBe(en);
    expect(de.name).toBe("Kritzelkiste");
    expect(en.name).toBe("Doodle Box");
  });

  it("speaks German with decimal commas and English with decimal points", () => {
    expect([de.factor(0), de.factor(1), de.factor(2)]).toEqual(["×1", "×1,5", "×2"]);
    expect([en.factor(0), en.factor(1), en.factor(2)]).toEqual(["×1", "×1.5", "×2"]);
    expect(de.guessedIt("Mia")).toBe("Mia hat es erraten!");
    expect(en.guessedIt("Mia")).toBe("Mia guessed it!");
    expect([de.near, en.near]).toEqual(["knapp daneben!", "close!"]);
    expect(de.stillGuessing(["Jonas", "Oma"])).toBe("Jonas und Oma raten noch");
    expect(en.stillGuessing(["Jonas"])).toBe("Jonas is still guessing");
    expect(de.scoreLine(270, true)).toBe("270 Punkte – du bist jetzt vorne!");
    expect(de.letters(10)).toBe("10 Buchst.");
    expect([de.color(9), en.color(1)]).toEqual(["Braun", "Grey"]);
    expect(de.winner(["Mia", "Ben", "Oma"])).toBe("Mia, Ben und Oma gewinnen!");
  });
});

describe("What the phone shows", () => {
  it("knows the role of every seat", () => {
    const current = view({ guessed: ["p2"], authors: ["p4"] });
    expect(["p1", "p2", "p3", "p4"].map((seat) => roleOf(current, seat))).toEqual(["guesser", "guessed", "drawer", "author"]);
    expect(roleOf(current, null)).toBe("watcher");
  });

  it("merges public and private notes in order and shows a correct guess without the word", () => {
    const current = view({
      feed: [
        { n: 1, p: 0, kind: "miss", by: "p4", text: " Turm " },
        { n: 2, p: 0, kind: "hit", by: "p2" },
        { n: 3, p: 0, kind: "hit", by: "p1" },
      ],
      gained: { p1: 120 },
    });
    const list = notes(current, [{ n: 1, p: 1, kind: "near", by: "p1", text: "Leuchtturn" }], [{ n: 3, p: 2, by: "p2", text: "Toll!" }], "p1", players, de);
    expect(list.map((note) => [note.kind, note.name, note.text])).toEqual([
      ["miss", "Jonas", "Turm"],
      ["near", "Du", "Leuchtturn"],
      ["hit", "Oma", "Oma hat es erraten!"],
      ["mine", "Du", "Du hast es erraten!"],
      ["chat", "Oma", "Toll!"],
    ]);
    expect(list[3]?.points).toBe(120);
  });

  it("builds the hint boxes, keeps spaces and hyphens open and shows the word after the turn", () => {
    const open = hintCells("__-_ _", null);
    expect(open.map((cell) => [cell.char, cell.open, cell.shown])).toEqual([
      ["", false, false],
      ["", false, false],
      ["-", true, true],
      ["", false, false],
      [" ", true, true],
      ["", false, false],
    ]);
    expect(hintLetters(open)).toBe(4);
    expect(hintCells("__u", "Hut").map((cell) => cell.char).join("")).toBe("Hut");
    expect(cellWidth(10, 300)).toBe(27);
    expect(cellWidth(3, 300)).toBe(30);
    expect(cellWidth(20, 200)).toBe(12);
  });

  it("sorts the scores, shares places on a tie and builds the podium", () => {
    const rows = standings(view({ scores: { p1: 100, p2: 300, p3: 100, p4: 50 } }), players);
    expect(rows.map((row) => [row.seat, row.place])).toEqual([
      ["p2", 1],
      ["p1", 2],
      ["p3", 2],
      ["p4", 4],
    ]);
    const stage = podium(rows);
    expect(stage.first.map((row) => row.seat)).toEqual(["p2"]);
    expect(stage.second.map((row) => row.seat)).toEqual(["p1", "p3"]);
    expect(stage.third).toEqual([]);
    expect(stage.rest.map((row) => row.seat)).toEqual(["p4"]);
    expect(turnRows(view({ gained: { p4: 150, p3: 30 } }), players).map((row) => row.seat)).toEqual(["p4", "p3", "p1", "p2"]);
  });

  it("names who is still guessing, who leads and what comes next", () => {
    const current = view({ guessed: ["p1"], authors: ["p4"] });
    expect(waitingFor(current, ["p1", "p2", "p3", "p4"])).toEqual(["p2"]);
    expect(inLead({ p1: 270, p2: 210 }, "p1")).toBe(true);
    expect(inLead({ p1: 270, p2: 270 }, "p1")).toBe(false);
    expect(nextLine(view({ turn: 0 }), "p1", players, de)).toBe("Gleich malst du!");
    expect(nextLine(view({ turn: 1 }), "p1", players, en)).toBe("Next up: Oma");
    expect(nextLine(view({ turn: 3, round: 3 }), "p1", players, de)).toBe("Gleich kommt das Ergebnis");
    expect(endedLine(view({ ended: "pass" }), players, de)).toBe("Ben hat gepasst.");
    expect(endedLine(view({ ended: "time" }), players, en)).toBe("Nobody guessed it.");
    expect(winnerLine(["p1"], "p1", players, de)).toBe("Du hast gewonnen!");
    expect(winnerLine(["p1", "p2"], "p3", players, en)).toBe("Mia and Oma win!");
  });

  it("shows the time in whole seconds", () => {
    expect(secondsLeft(940)).toBe(47);
    expect(secondsLeft(1)).toBe(1);
    expect(secondsLeft(0)).toBe(0);
  });

  it("gives every seat its own color", () => {
    expect(new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"].map(seatColor)).size).toBe(10);
  });
});

describe("Layout", () => {
  it("makes the sheet as big as the rest allows, square and not wider than the phone", () => {
    expect(sheetSize(336, 620, 280, 0)).toBe(336);
    expect(sheetSize(336, 548, 280, 0)).toBe(268);
    expect(sheetSize(296, 400, 380, 76)).toBe(120);
  });

  it("guesses the visible part above the keyboard", () => {
    expect(typingHeight(700, 700, undefined)).toBe(392);
    expect(typingHeight(700, 700, 380)).toBe(380);
    expect(typingHeight(400, 700, undefined)).toBe(400);
  });

  it("maps a finger position onto the fixed picture size", () => {
    const rect = { left: 10, top: 20, width: 300, height: 300 };
    expect(toPicture(10, 20, rect, 600)).toEqual([0, 0]);
    expect(toPicture(310, 320, rect, 600)).toEqual([599, 599]);
    expect(toPicture(160, 170, rect, 600)).toEqual([300, 300]);
    expect(farEnough([0, 0], 3, 0, 4)).toBe(false);
    expect(farEnough([0, 0], 3, 3, 4)).toBe(true);
  });

  it("plays the drawing back for the watchers evenly, a little behind, instead of in jumps", () => {
    const playback = new Playback(140, 100);
    playback.update("a".repeat(40), 1000);
    expect(playback.length(1000)).toBe(40);
    playback.update("a".repeat(80), 2000);
    expect(playback.length(2000)).toBe(40);
    expect(playback.length(2040)).toBe(40);
    expect(playback.length(2090)).toBe(60);
    expect(playback.length(2140)).toBe(80);
    playback.update("a".repeat(120), 2200);
    expect(playback.length(2240)).toBe(80);
    expect(playback.length(2290)).toBe(100);
    expect(playback.length(2340)).toBe(120);
    playback.update("b", 2400);
    expect(playback.length(2400)).toBe(1);
  });
});

describe("Fill on the fixed picture", () => {
  it("fills the area inside a closed line and stops at the line", () => {
    const raster = new Raster(40);
    const square = [5, 5, 30, 5, 30, 30, 5, 30, 5, 5];
    for (let index = 0; index + 3 < square.length; index += 2) {
      raster.segment(square[index]!, square[index + 1]!, square[index + 2]!, square[index + 3]!, 1.5, 1);
    }
    const area = raster.fill(15, 15, 4);
    expect(area).toBeDefined();
    expect(raster.at(15, 15)).toBe(4);
    expect(raster.at(2, 2)).toBe(0);
    expect(raster.at(5, 15)).toBe(1);
    expect(area?.left).toBeGreaterThan(5);
    expect(area?.right).toBeLessThan(30);
    expect(raster.fill(15, 15, 4)).toBeUndefined();
  });
});

describe("Sending the drawing", () => {
  const red = penStyle(2, 1);

  it("sends what the drawer drew and stops once the server has it", () => {
    const sync = new DrawerSync();
    sync.start("", 0);
    sync.begin(red, 1, 1);
    sync.point(2, 2);
    expect(sync.next("", 0, 1, 0)).toEqual({ type: "stroke", op: 0, at: 0, style: red, points: encodePoint(1, 1) + encodePoint(2, 2) });
    sync.observe(sync.local, 1);
    expect(sync.pending).toBe(false);
    expect(sync.next(sync.local, 1, 2, 50)).toBeUndefined();
  });

  it("never overwrites the picture from a second device of the same seat that drew nothing", () => {
    const idle = new DrawerSync();
    idle.start("", 0);
    const server = encodeStroke(red, [5, 5, 6, 6]);
    idle.observe(server, 1);
    expect(idle.local).toBe(server);
    expect(idle.next(server, 1, 5, 0)).toBeUndefined();
  });

  it("asks the server to undo and clear", () => {
    const sync = new DrawerSync();
    const server = encodeStroke(red, [5, 5]) + encodeStroke(red, [7, 7]);
    sync.start(server, 2);
    sync.undo();
    expect(sync.next(server, 2, 1, 0)).toEqual({ type: "cut", keep: 1 });
    sync.clear();
    expect(sync.next(server, 2, 2, 400)).toEqual({ type: "cut", keep: 0 });
  });

  it("gives up and takes the server's picture if the server keeps ignoring a piece", () => {
    const sync = new DrawerSync();
    sync.start("", 0);
    sync.begin(red, 1, 1);
    for (let tick = 0; tick <= 12; tick += 3) {
      sync.next("", 0, tick, tick * 100);
    }
    expect(sync.pending).toBe(false);
    expect(sync.local).toBe("");
  });

  it("stops adding points when the sheet is full", () => {
    const sync = new DrawerSync();
    sync.start(encodeStroke(red, new Array(maxInk * 2).fill(1)), 1);
    expect(sync.full).toBe(true);
    expect(sync.point(3, 3)).toBe(false);
    expect(sync.begin(red, 3, 3)).toBe(false);
    expect(planSync(sync.local, sync.local)).toBeUndefined();
  });
});
