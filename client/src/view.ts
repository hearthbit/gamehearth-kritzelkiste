import type { PlayerInfo, PlayerSnapshot, ScreenSnapshot } from "@gamehearth/sdk/client";
import type { Chat, Entry, KritzelAction, Me, Public } from "../../src/game";
import { isOpenChar } from "../../src/guess";
import type { Texts } from "./texts";

export type Snapshot = PlayerSnapshot<Public, Me, KritzelAction>;
export type Screen = ScreenSnapshot<Public>;
export type Players = Record<string, PlayerInfo>;

export const inkColors = ["#fffdf8", "#2d2a35", "#8b8794", "#d94a3d", "#ef8a2c", "#f2c230", "#3f9a4a", "#3c7bd1", "#8a5cc2", "#ec7fae", "#8a5a3b"] as const;
export const seatColors = ["#ffc6d0", "#c8e2ff", "#ffe08a", "#c9efc0", "#e2d2ff", "#ffd4b0", "#b9ece6", "#f6c9ef", "#d9e7a8", "#e6d3c3"] as const;
export const ticksPerSecond = 20;

export type Role = "drawer" | "guesser" | "guessed" | "author" | "watcher";

export function seatColor(seat: string): string {
  const index = Number(seat.slice(1)) - 1;
  return seatColors[(Number.isFinite(index) ? index : 0) % seatColors.length] ?? seatColors[0];
}

export function nameOf(seat: string | null, players: Players): string {
  return seat === null ? "" : (players[seat]?.name ?? seat);
}

export function initial(name: string): string {
  const first = [...name.trim()][0] ?? "?";
  return first.toLocaleUpperCase();
}

export function secondsLeft(ticksLeft: number): number {
  return Math.max(0, Math.ceil(ticksLeft / ticksPerSecond));
}

export function ringShare(ticksLeft: number, phaseTicks: number): number {
  return phaseTicks <= 0 ? 0 : Math.min(1, Math.max(0, ticksLeft / phaseTicks));
}

export function roleOf(view: Public, seat: string | null): Role {
  if (seat === null) {
    return "watcher";
  }
  if (view.drawer === seat) {
    return "drawer";
  }
  if (view.authors.includes(seat)) {
    return "author";
  }
  return view.guessed.includes(seat) ? "guessed" : "guesser";
}

export type NoteKind = "miss" | "hit" | "mine" | "near" | "long" | "chat";

export interface Note {
  key: number;
  kind: NoteKind;
  seat: string;
  name: string;
  text: string;
  points: number;
}

export function noteKey(n: number, p: number): number {
  return n * 100000 + p;
}

export function notes(view: Public, own: readonly Entry[], chat: readonly Chat[], viewer: string | null, players: Players, t: Texts): Note[] {
  const merged: (Entry | (Chat & { kind: "chat" }))[] = [...view.feed, ...own, ...chat.map((line) => ({ ...line, kind: "chat" as const }))];
  merged.sort((a, b) => noteKey(a.n, a.p) - noteKey(b.n, b.p));
  return merged.map((entry) => {
    const key = noteKey(entry.n, entry.p);
    const mine = entry.by === viewer;
    const name = mine ? t.you : nameOf(entry.by, players);
    if (entry.kind === "hit") {
      return mine
        ? { key, kind: "mine", seat: entry.by, name, text: t.youGuessed, points: view.gained[entry.by] ?? 0 }
        : { key, kind: "hit", seat: entry.by, name, text: t.guessedIt(name), points: 0 };
    }
    return { key, kind: entry.kind, seat: entry.by, name, text: entry.text.trim(), points: 0 };
  });
}

export function solution(view: Public, me: Pick<Me, "solved"> | undefined): string | null {
  if (view.phase === "reveal") {
    return view.word;
  }
  return me !== undefined && me.solved.length > 0 ? me.solved.join("") : null;
}

export function headline(view: Public, seat: string | null, players: Players, t: Texts): { strong: string; rest: string } {
  if (view.phase === "reveal") {
    return { strong: t.revealTitle, rest: "" };
  }
  if (view.drawer === null) {
    return { strong: "", rest: "" };
  }
  if (view.drawer === seat) {
    return { strong: view.phase === "choose" ? t.youChoose : t.youDraw, rest: "" };
  }
  return { strong: nameOf(view.drawer, players), rest: ` ${view.phase === "choose" ? t.isChoosing : t.isDrawing}` };
}

export interface Cell {
  char: string;
  open: boolean;
  shown: boolean;
}

export function hintCells(hint: string, word: string | null): Cell[] {
  const solution = word === null ? undefined : [...word];
  return [...hint].map((char, index) => {
    const solved = solution?.[index];
    if (solved !== undefined) {
      return { char: solved, open: isOpenChar(solved), shown: true };
    }
    return { char: char === "_" ? "" : char, open: isOpenChar(char), shown: char !== "_" };
  });
}

export function hintLetters(cells: readonly Cell[]): number {
  return cells.filter((cell) => !cell.open).length;
}

export function cellWidth(count: number, width: number, largest = 30): number {
  if (count <= 0) {
    return largest;
  }
  return Math.max(12, Math.min(largest, Math.floor((width - 3 * (count - 1)) / count)));
}

export interface Standing {
  seat: string;
  name: string;
  score: number;
  gained: number;
  place: number;
}

export function standings(view: Public, players: Players): Standing[] {
  const rows = Object.entries(view.scores)
    .map(([seat, score]) => ({ seat, name: nameOf(seat, players), score, gained: view.gained[seat] ?? 0, place: 0 }))
    .sort((a, b) => b.score - a.score || (a.seat < b.seat ? -1 : a.seat > b.seat ? 1 : 0));
  rows.forEach((row, index) => {
    const before = rows[index - 1];
    row.place = before !== undefined && before.score === row.score ? before.place : index + 1;
  });
  return rows;
}

export function turnRows(view: Public, players: Players): Standing[] {
  return standings(view, players).sort((a, b) => b.gained - a.gained || b.score - a.score || (a.seat < b.seat ? -1 : 1));
}

export function waitingFor(view: Public, seats: readonly string[]): string[] {
  return seats.filter((seat) => seat !== view.drawer && !view.authors.includes(seat) && !view.guessed.includes(seat));
}

export function inLead(scores: Record<string, number>, seat: string): boolean {
  const mine = scores[seat] ?? 0;
  return mine > 0 && Object.entries(scores).every(([other, score]) => other === seat || score < mine);
}

export function nextDrawer(view: Public): string | null {
  const next = view.turn + 1;
  if (next < view.order.length) {
    return view.order[next] ?? null;
  }
  return view.round < view.rounds ? (view.order[0] ?? null) : null;
}

export class Playback {
  private marks: [number, number][] = [];
  private text = "";

  constructor(
    private readonly delay = 140,
    private readonly spread = 100,
  ) {}

  update(text: string, now: number): void {
    if (text === this.text) {
      return;
    }
    const last = this.marks.at(-1);
    if (!text.startsWith(this.text) || last === undefined) {
      this.marks = [[now - this.delay, text.length]];
    } else {
      if (now - last[0] > this.spread) {
        this.marks.push([now - this.spread, last[1]]);
      }
      this.marks.push([now, text.length]);
    }
    this.text = text;
  }

  length(now: number): number {
    const at = now - this.delay;
    while (this.marks.length > 1 && (this.marks[1]?.[0] ?? Infinity) <= at) {
      this.marks.shift();
    }
    const [from, to] = this.marks;
    if (from === undefined) {
      return this.text.length;
    }
    if (to === undefined || at <= from[0]) {
      return from[1];
    }
    const share = (at - from[0]) / Math.max(1, to[0] - from[0]);
    return Math.round(from[1] + (to[1] - from[1]) * Math.min(1, share));
  }
}

export function sheetSize(width: number, height: number, used: number, reserve: number): number {
  return Math.max(120, Math.floor(Math.min(width, height - used - reserve)));
}

export function typingHeight(height: number, tallest: number, visual: number | undefined): number {
  if (visual !== undefined && visual < height - 80) {
    return Math.max(220, Math.floor(visual));
  }
  if (height < tallest - 120) {
    return height;
  }
  return Math.max(260, Math.floor(height * 0.56));
}

export function toPicture(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, size: number): [number, number] {
  const x = Math.round(((clientX - rect.left) / Math.max(1, rect.width)) * size - 0.5);
  const y = Math.round(((clientY - rect.top) / Math.max(1, rect.height)) * size - 0.5);
  return [Math.min(size - 1, Math.max(0, x)), Math.min(size - 1, Math.max(0, y))];
}

export function farEnough(last: readonly [number, number] | undefined, x: number, y: number, distance: number): boolean {
  if (last === undefined) {
    return true;
  }
  const dx = x - last[0];
  const dy = y - last[1];
  return dx * dx + dy * dy >= distance * distance;
}

export function endedLine(view: Public, players: Players, t: Texts): string {
  if (view.ended === "pass") {
    return t.endedPass(nameOf(view.drawer, players));
  }
  if (view.ended === "all") {
    return t.endedAll;
  }
  return view.guessed.length === 0 ? t.nobody : t.endedTime;
}

export function nextLine(view: Public, viewer: string | null, players: Players, t: Texts): string {
  const next = nextDrawer(view);
  if (next === null) {
    return t.lastTurn;
  }
  return next === viewer ? t.nextUpYou : t.nextUp(nameOf(next, players));
}

export function winnerLine(winners: readonly string[], viewer: string | null, players: Players, t: Texts): string {
  if (winners.length === 0) {
    return t.nobodyWins;
  }
  if (viewer !== null && winners.length === 1 && winners[0] === viewer) {
    return t.youWin;
  }
  return t.winner(winners.map((seat) => (seat === viewer ? t.you : nameOf(seat, players))));
}

export function podium(rows: readonly Standing[]): { first: Standing[]; second: Standing[]; third: Standing[]; rest: Standing[] } {
  return {
    first: rows.filter((row) => row.place === 1),
    second: rows.filter((row) => row.place === 2),
    third: rows.filter((row) => row.place === 3),
    rest: rows.filter((row) => row.place > 3),
  };
}

export function clockLabel(ticksLeft: number, t: Texts): string {
  return t.secondsLeft(secondsLeft(ticksLeft));
}
