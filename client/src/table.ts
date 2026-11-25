import type { GameConnection, ScreenConnection } from "@gamehearth/sdk/client";
import type { Chat, Entry, KritzelAction, KritzelState, Options, Public } from "../../src/game";
import { cleanOwnWord, maxGuessLength, maxOwnWordLength, normalizeWord } from "../../src/guess";
import { colorCount, eraserStyleOf, penStyle, pictureSize, styleWidth, widthCount } from "../../src/picture";
import { icon, pencilSvg, type IconName } from "./icons";
import { Painter } from "./painter";
import { DrawerSync } from "./sync";
import type { Texts } from "./texts";
import {
  cellWidth,
  endedLine,
  farEnough,
  hintCells,
  hintLetters,
  inkColors,
  initial,
  inLead,
  nameOf,
  nextLine,
  notes,
  podium,
  Playback,
  ringShare,
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
  headline,
  solution,
  type Note,
  type Players,
  type Standing,
} from "./view";

type PhoneGame = GameConnection<KritzelState, KritzelAction, Options>;
type TvGame = ScreenConnection<KritzelState, Options>;
type Tool = "pen" | "eraser" | "fill";

const gap = 8;
const minStep = 4;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function iconEl(name: IconName, className = "ic"): HTMLElement {
  const node = el("i", className);
  node.innerHTML = icon(name);
  return node;
}

function tilt(key: number): string {
  return `${((key * 37) % 7) - 3}deg`;
}

function avatar(seat: string, players: Players, badge?: "ok" | "draw", small = false): HTMLElement {
  const node = el("span", small ? "av sm" : "av", initial(nameOf(seat, players)));
  node.style.setProperty("--c", seatColor(seat));
  node.setAttribute("aria-hidden", "true");
  if (badge !== undefined) {
    const mark = el("b", `bd ${badge}`);
    mark.innerHTML = icon(badge === "ok" ? "check" : "pencil");
    node.append(mark);
  }
  return node;
}

class Ring {
  readonly node: HTMLElement;
  private readonly progress: SVGCircleElement;
  private readonly label: HTMLElement;
  private readonly length: number;

  constructor(size: number) {
    this.node = el("div", "ring");
    const stroke = 5;
    const radius = (size - stroke) / 2 - 1;
    this.length = 2 * Math.PI * radius;
    this.node.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke-width="${stroke}"/><circle class="prg" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke-width="${stroke}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><span></span>`;
    this.progress = this.node.querySelector(".prg") as SVGCircleElement;
    this.label = this.node.querySelector("span") as HTMLElement;
  }

  set(ticksLeft: number, phaseTicks: number, label: string): void {
    const share = ringShare(ticksLeft, phaseTicks);
    this.progress.setAttribute("stroke-dasharray", `${(this.length * share).toFixed(1)} ${this.length.toFixed(1)}`);
    this.node.classList.toggle("low", secondsLeft(ticksLeft) <= 10 && phaseTicks > 0);
    const seconds = String(secondsLeft(ticksLeft));
    if (this.label.textContent !== seconds) {
      this.label.textContent = seconds;
    }
    this.node.setAttribute("aria-label", label);
    this.node.setAttribute("role", "timer");
  }
}

function noteEl(note: Note, t: Texts, compact: boolean): HTMLElement {
  const node = el("div", `note ${note.kind === "miss" || note.kind === "long" ? "x" : note.kind === "hit" ? "ok" : note.kind === "mine" ? "me" : note.kind}`);
  node.style.setProperty("--r", tilt(note.key));
  if (note.kind === "hit") {
    node.append(iconEl("check"), el("span", "", compact ? t.guessedShort(note.name) : note.text));
  } else if (note.kind === "mine") {
    node.append(el("span", "", note.text), el("b", "", t.plus(note.points)));
  } else if (note.kind === "long") {
    if (!compact) {
      const label = el("small");
      label.append(iconEl("eye"), document.createTextNode(t.onlyForYou));
      node.append(label);
    }
    node.append(el("span", "", note.text), el("b", "", t.tooLong));
  } else if (note.kind === "near") {
    if (!compact) {
      const label = el("small");
      label.append(iconEl("eye"), document.createTextNode(t.onlyForYou));
      node.append(label);
    }
    node.append(el("span", "", note.text), el("b", "", t.near));
  } else {
    if (!compact || note.kind === "chat") {
      node.append(el("small", "", note.name));
    }
    node.append(el("span", "", note.text));
  }
  return node;
}

function confetti(layer: HTMLElement, count: number): void {
  const colors = ["#d94a3d", "#f2c230", "#3c7bd1", "#3f9a4a", "#8a5cc2", "#ef8a2c"];
  for (let index = 0; index < count; index++) {
    const piece = el("b");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.width = `${4 + Math.random() * 5}px`;
    piece.style.height = `${8 + Math.random() * 8}px`;
    piece.style.background = colors[index % colors.length] ?? "#d94a3d";
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    layer.append(piece);
  }
  window.setTimeout(() => layer.replaceChildren(), 3400);
}

export function mountTable(root: HTMLElement, game: PhoneGame | TvGame, t: Texts): void {
  const tv = game.role === "screen";
  const phone = tv ? undefined : (game as PhoneGame);
  const seat = phone?.seat ?? null;

  root.className = `game paper ${tv ? "tv" : "phone"}`;
  root.innerHTML = "";

  const head = el("div", "head");
  const topDraw = el("div", "top top-draw");
  const sticky = el("div", "sticky");
  const stickyLabel = el("div", "st-l");
  stickyLabel.append(iconEl("eye"), el("span", "", t.onlyYou));
  const myWord = el("div", "st-w");
  const myLevel = el("div", "st-f");
  const pass = el("button", "pass");
  pass.type = "button";
  pass.setAttribute("aria-label", t.giveUpLabel);
  const passLabel = el("span", "", t.giveUp);
  pass.append(iconEl("flag"), passLabel);
  sticky.append(el("span", "tape tp"), stickyLabel, myWord, myLevel, pass);
  const clock = el("div", "clock");
  const ringDraw = new Ring(58);
  const roundDraw = el("div", "rnd");
  clock.append(ringDraw.node, roundDraw);
  topDraw.append(sticky, clock);

  const topInfo = el("div", "top top-info");
  const drawerAv = el("span", "av-slot");
  const who = el("div", "who");
  const whoLine = el("div", "who-l");
  const whoSub = el("small");
  who.append(whoLine, whoSub);
  const mini = el("div", "mini");
  const ringInfo = new Ring(tv ? 64 : 54);
  topInfo.append(drawerAv, who, mini, ringInfo.node);
  const playersRow = el("div", "players");
  head.append(topDraw, topInfo, playersRow);

  const side = el("div", "side");
  const ringSide = new Ring(56);
  const roundSide = el("div", "rnd");
  const sideAv = el("span", "av-slot");
  side.append(ringSide.node, roundSide, sideAv, el("small", "", t.isDrawing));

  const sheetRow = el("div", "sheet-row");
  const sheet = el("div", "sheet");
  sheet.setAttribute("role", "img");
  const canvas = el("canvas");
  const nib = el("span", "nib");
  const sheetMsg = el("div", "sheet-msg");
  const choices = el("div", "choices");
  const reveal = el("div", "reveal");
  const stamp = el("div", "stamp");
  const stampPoints = el("b");
  stamp.append(el("span", "", t.right), stampPoints);
  sheet.append(el("span", "tape tpl"), el("span", "tape tpr"), canvas, nib, sheetMsg, choices, reveal, stamp);
  sheetRow.append(sheet);

  const rest = el("div", "rest");
  const cells = el("div", "cells");
  cells.setAttribute("role", "img");
  const seen = el("div", "seen");
  const seenNotes = el("div", "seen-n");
  seen.append(el("span", "seen-l", t.tipsOfOthers), seenNotes);
  const notesBox = el("div", "notes");
  notesBox.setAttribute("aria-live", "polite");
  const strip = el("div", "strip");
  const stripCount = el("button", "cnt");
  stripCount.type = "button";
  stripCount.setAttribute("aria-label", t.showAllTips);
  const stripNotes = el("div", "strip-n");
  strip.append(stripCount, stripNotes);
  const board = el("div", "board");
  const wait = el("div", "wait");
  const inkFull = el("p", "ink-full", t.inkFull);
  const guessRow = el("div", "guess");
  const inputLabel = el("label", "inp");
  const input = el("input");
  input.type = "text";
  input.maxLength = maxGuessLength;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("enterkeyhint", "send");
  inputLabel.append(iconEl("pencil"), input);
  const send = el("button", "send");
  send.type = "button";
  send.setAttribute("aria-label", t.send);
  send.innerHTML = icon("send");
  guessRow.append(inputLabel, send);

  const dock = el("div", "dock");
  const pencilCase = el("div", "case");
  pencilCase.setAttribute("role", "group");
  pencilCase.setAttribute("aria-label", t.pencils);
  const tools = el("div", "tools");
  tools.setAttribute("role", "group");
  tools.setAttribute("aria-label", t.tools);
  dock.append(pencilCase, tools);
  rest.append(cells, seen, notesBox, strip, board, wait, inkFull, guessRow, dock);

  const wordsPanel = el("div", "panel words");
  const podiumPanel = el("div", "panel podium");
  const flash = el("div", "flash");
  const confettiLayer = el("div", "confetti");
  root.append(head, side, sheetRow, rest, wordsPanel, podiumPanel, flash, confettiLayer);

  const painter = new Painter(canvas);

  let view: Public | undefined;
  let players: Players = {};
  let own: Entry[] = [];
  let chat: Chat[] = [];
  let solved: string[] = [];
  let moves: KritzelAction[] = [];
  let result: { winners: string[] } | undefined;

  let tool: Tool = "pen";
  let color = 0;
  let width = 1;
  const sync = new DrawerSync();
  let localKey = "";
  let activePointer: number | undefined;
  let lastPoint: [number, number] | undefined;
  let inFlight = false;
  let holdUntil = 0;
  const playback = new Playback();
  let typing = false;
  let tallest = { width: 0, height: 0 };
  let layoutKey = "";
  let renderedNotes = new Map<number, HTMLElement>();
  let notesTurn = "";
  let wonTurn = "";
  let confirmPass = 0;
  let confirmClear = 0;
  let podiumShown = false;
  let rendered = false;

  const turnKey = (current: Public) => `${current.round}:${current.turn}`;
  const isDrawer = () => view !== undefined && seat !== null && view.drawer === seat && view.phase === "draw";

  const pencilButtons: HTMLButtonElement[] = [];
  for (let index = 0; index < colorCount; index++) {
    const button = el("button", `pc ${index % 2 === 0 ? "back" : "front"}`);
    button.type = "button";
    button.style.setProperty("--i", String(index));
    button.setAttribute("aria-label", t.color(index));
    button.innerHTML = pencilSvg(inkColors[index + 1] ?? "#000");
    button.addEventListener("click", () => {
      color = index;
      if (tool === "eraser") {
        tool = "pen";
      }
      renderTools();
    });
    pencilButtons.push(button);
  }
  const pocket = el("div", "pocket");
  pencilCase.append(...pencilButtons, pocket);

  function toolButton(label: string, content: HTMLElement, onClick: () => void, className = ""): HTMLButtonElement {
    const button = el("button", `tl ${className}`.trim());
    button.type = "button";
    const caption = el("small", "", label);
    button.append(content, caption);
    button.addEventListener("click", onClick);
    return button;
  }

  function dot(size: number): HTMLElement {
    const wrap = el("span", "dw");
    const inner = el("span", "dot");
    inner.style.setProperty("--s", `${size}px`);
    wrap.append(inner);
    return wrap;
  }

  const widthButtons = [0, 1, 2].map((index) =>
    toolButton(t.width(index), dot([6, 12, 20][index] ?? 12), () => {
      width = index;
      if (tool === "fill") {
        tool = "pen";
      }
      renderTools();
    }, "wd"),
  );
  const widthCycle = toolButton(t.width(width), dot(12), () => {
    width = (width + 1) % widthCount;
    if (tool === "fill") {
      tool = "pen";
    }
    renderTools();
  }, "wc");
  widthCycle.setAttribute("aria-label", t.widthLabel);
  const eraserButton = toolButton(t.eraser, iconEl("eraser"), () => {
    tool = tool === "eraser" ? "pen" : "eraser";
    renderTools();
  });
  const fillButton = toolButton(t.fill, iconEl("bucket"), () => {
    tool = tool === "fill" ? "pen" : "fill";
    renderTools();
  });
  const undoButton = toolButton(t.undo, iconEl("undo"), () => {
    if (sync.undo()) {
      renderInk();
      pump();
    }
  });
  const clearCaption = el("small", "", t.clear);
  const clearButton = el("button", "tl warn");
  clearButton.type = "button";
  clearButton.append(iconEl("trash"), clearCaption);
  clearButton.addEventListener("click", () => {
    if (performance.now() > confirmClear) {
      confirmClear = performance.now() + 3000;
      clearCaption.textContent = t.clearSure;
      window.setTimeout(() => {
        if (performance.now() > confirmClear) {
          clearCaption.textContent = t.clear;
        }
      }, 3100);
      return;
    }
    confirmClear = 0;
    clearCaption.textContent = t.clear;
    sync.clear();
    renderInk();
    pump();
  });
  tools.append(...widthButtons, widthCycle, eraserButton, fillButton, undoButton, clearButton);

  function renderTools(): void {
    pencilButtons.forEach((button, index) => {
      const selected = index === color && tool !== "eraser";
      button.classList.toggle("sel", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    widthButtons.forEach((button, index) => {
      const selected = index === width && tool !== "fill";
      button.classList.toggle("sel", selected);
      button.setAttribute("aria-pressed", String(selected));
      const inner = button.querySelector<HTMLElement>(".dot");
      inner?.style.setProperty("background", tool === "eraser" ? "#b9b3a6" : (inkColors[color + 1] ?? "#000"));
    });
    const cycleDot = widthCycle.querySelector<HTMLElement>(".dot");
    cycleDot?.style.setProperty("--s", `${[6, 12, 20][width] ?? 12}px`);
    cycleDot?.style.setProperty("background", tool === "eraser" ? "#b9b3a6" : (inkColors[color + 1] ?? "#000"));
    const cycleCaption = widthCycle.querySelector("small");
    if (cycleCaption !== null) {
      cycleCaption.textContent = t.width(width);
    }
    eraserButton.classList.toggle("sel", tool === "eraser");
    eraserButton.setAttribute("aria-pressed", String(tool === "eraser"));
    fillButton.classList.toggle("sel", tool === "fill");
    fillButton.setAttribute("aria-pressed", String(tool === "fill"));
    root.style.setProperty("--pen", inkColors[color + 1] ?? "#000");
    sheet.classList.toggle("filling", tool === "fill");
  }

  function renderInk(): void {
    const fillsFull = tool === "fill" && sync.fillsFull;
    inkFull.textContent = sync.full ? t.inkFull : t.fillsFull;
    inkFull.hidden = !(isDrawer() && (sync.full || fillsFull));
    undoButton.disabled = sync.ops === 0;
  }

  pass.addEventListener("click", () => {
    if (performance.now() > confirmPass) {
      confirmPass = performance.now() + 3000;
      passLabel.textContent = t.giveUpSure;
      pass.classList.add("sure");
      window.setTimeout(() => {
        if (performance.now() > confirmPass) {
          passLabel.textContent = t.giveUp;
          pass.classList.remove("sure");
        }
      }, 3100);
      return;
    }
    confirmPass = 0;
    passLabel.textContent = t.giveUp;
    pass.classList.remove("sure");
    if (phone !== undefined && moves.some((move) => move.type === "pass")) {
      void phone.move({ type: "pass" });
    }
  });

  function pump(): void {
    if (phone === undefined || inFlight || !isDrawer() || localKey === "" || performance.now() < holdUntil) {
      return;
    }
    const snapshot = phone.current.snapshot;
    const plan = sync.next(snapshot.public.pic, snapshot.public.ops, snapshot.tick ?? 0, performance.now());
    if (plan === undefined) {
      return;
    }
    inFlight = true;
    const done = (ok: boolean) => {
      inFlight = false;
      if (!ok) {
        holdUntil = performance.now() + 150;
      }
      pump();
    };
    phone.move(plan).then(
      (answer) => done(answer.ok),
      () => done(false),
    );
  }
  window.setInterval(pump, 50);

  function addPoint(x: number, y: number): void {
    if (farEnough(lastPoint, x, y, minStep) && sync.point(x, y)) {
      lastPoint = [x, y];
    }
  }

  function placeNib(event: PointerEvent): void {
    const box = sheet.getBoundingClientRect();
    const size = Math.max(16, (styleWidth(tool === "eraser" ? eraserStyleOf(width) : penStyle(color, width)) * box.width) / pictureSize + 10);
    nib.style.setProperty("--n", `${size}px`);
    nib.style.left = `${event.clientX - box.left}px`;
    nib.style.top = `${event.clientY - box.top}px`;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!isDrawer() || activePointer !== undefined || !event.isPrimary || event.button > 0) {
      return;
    }
    event.preventDefault();
    const [x, y] = toPicture(event.clientX, event.clientY, canvas.getBoundingClientRect(), pictureSize);
    if (sync.full) {
      renderInk();
      return;
    }
    if (tool === "fill") {
      if (painter.wouldFill(x, y, color) && sync.fill(color, x, y)) {
        pump();
      }
      return;
    }
    const style = tool === "eraser" ? eraserStyleOf(width) : penStyle(color, width);
    if (!sync.begin(style, x, y)) {
      return;
    }
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    lastPoint = [x, y];
    nib.classList.add("on");
    nib.classList.toggle("rub", tool === "eraser");
    placeNib(event);
    pump();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer || !isDrawer()) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    for (const each of events.length > 0 ? events : [event]) {
      const [x, y] = toPicture(each.clientX, each.clientY, rect, pictureSize);
      addPoint(x, y);
    }
    placeNib(event);
  });
  const release = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) {
      return;
    }
    activePointer = undefined;
    lastPoint = undefined;
    nib.classList.remove("on");
    renderInk();
    pump();
  };
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);

  function sendTyped(): void {
    if (phone === undefined) {
      return;
    }
    const value = input.value;
    if (value.trim() === "") {
      return;
    }
    const kind = moves.find((move) => move.type === "guess" || move.type === "chat")?.type;
    if (kind !== "guess" && kind !== "chat") {
      return;
    }
    input.value = "";
    void phone.move({ type: kind, text: [...value].slice(0, maxGuessLength).join("") });
  }
  send.addEventListener("pointerdown", (event) => event.preventDefault());
  send.addEventListener("click", () => {
    sendTyped();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      sendTyped();
    }
  });
  input.addEventListener("focus", () => {
    typing = true;
    window.scrollTo(0, 0);
    render();
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.activeElement !== input) {
        typing = false;
        render();
      }
    }, 120);
  });
  stripCount.addEventListener("click", () => input.blur());

  const wordsTitle = el("h2", "hand", t.wordsTitle);
  const wordsIntro = el("p", "intro", t.wordsIntro);
  const wordRow = el("div", "wrow");
  const wordInput = el("input");
  wordInput.type = "text";
  wordInput.maxLength = maxOwnWordLength;
  wordInput.autocomplete = "off";
  wordInput.spellcheck = false;
  wordInput.placeholder = t.wordPlaceholder;
  wordInput.setAttribute("aria-label", t.wordPlaceholder);
  wordInput.setAttribute("enterkeyhint", "done");
  const addWord = el("button", "add");
  addWord.type = "button";
  addWord.append(iconEl("plus"), el("span", "", t.add));
  wordRow.append(wordInput, addWord);
  const wordError = el("p", "werr");
  wordError.setAttribute("aria-live", "polite");
  const myWords = el("div", "mywords");
  const doneButton = el("button", "done", t.done);
  doneButton.type = "button";
  const wordsStatus = el("div", "wstatus");
  const ringWords = new Ring(54);
  const readyLine = el("span");
  wordsStatus.append(ringWords.node, readyLine);
  const wordSeats = el("div", "wseats");
  wordsPanel.append(wordsTitle, wordsIntro, wordRow, wordError, myWords, doneButton, wordsStatus, wordSeats);

  function submitWord(): void {
    if (phone === undefined || view === undefined || seat === null) {
      return;
    }
    const cleaned = cleanOwnWord(wordInput.value);
    if (cleaned === undefined) {
      wordError.textContent = t.invalidWord;
      return;
    }
    const mine = phone.current.snapshot.me.ownWords;
    const language = phone.current.options["wordLanguage"] === "en" ? "en" : "de";
    if (mine.some((word) => normalizeWord(word, language) === normalizeWord(cleaned, language))) {
      wordError.textContent = t.duplicateWord;
      return;
    }
    if (!moves.some((move) => move.type === "word")) {
      return;
    }
    wordError.textContent = "";
    wordInput.value = "";
    void phone.move({ type: "word", text: cleaned });
  }
  addWord.addEventListener("pointerdown", (event) => event.preventDefault());
  addWord.addEventListener("click", submitWord);
  wordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      submitWord();
    }
  });
  doneButton.addEventListener("click", () => {
    if (phone !== undefined && moves.some((move) => move.type === "done")) {
      void phone.move({ type: "done" });
    }
  });

  function renderWords(current: Public): void {
    const seats = Object.keys(current.scores);
    const ready = current.done.length;
    ringWords.set(current.ticksLeft, current.phaseTicks, t.secondsLeft(secondsLeft(current.ticksLeft)));
    readyLine.textContent = t.readyCount(ready, seats.length);
    wordSeats.replaceChildren(
      ...seats.map((other) => {
        const chip = el("div", `wseat ${current.done.includes(other) ? "ready" : ""}`);
        chip.append(avatar(other, players, current.done.includes(other) ? "ok" : undefined, true), el("span", "", other === seat ? t.you : nameOf(other, players)), el("small", "", t.wordCount(current.wordCount[other] ?? 0)));
        return chip;
      }),
    );
    if (tv || phone === undefined) {
      wordsTitle.textContent = t.tvWords;
      wordsIntro.hidden = true;
      wordRow.hidden = true;
      myWords.hidden = true;
      doneButton.hidden = true;
      return;
    }
    const mine = phone.current.snapshot.me.ownWords;
    const finished = seat !== null && current.done.includes(seat);
    wordRow.hidden = finished || mine.length >= 3;
    doneButton.hidden = finished;
    wordsIntro.textContent = finished ? t.wordsDone : t.wordsIntro;
    const key = mine.join("\u0000") + (finished ? "!" : "");
    if (myWords.dataset["key"] !== key) {
      myWords.dataset["key"] = key;
      myWords.replaceChildren(
        ...mine.map((word, index) => {
          const note = el("div", "wnote");
          note.style.setProperty("--r", tilt(index + 2));
          note.append(el("span", "", word));
          if (!finished) {
            const remove = el("button", "wdel");
            remove.type = "button";
            remove.setAttribute("aria-label", t.remove(word));
            remove.innerHTML = icon("close");
            remove.addEventListener("click", () => {
              if (moves.some((move) => move.type === "drop" && move.index === index)) {
                void phone.move({ type: "drop", index });
              }
            });
            note.append(remove);
          }
          return note;
        }),
      );
    }
  }

  function renderChoices(current: Public): void {
    if (phone === undefined || current.phase !== "choose" || current.drawer !== seat) {
      choices.replaceChildren();
      choices.dataset["key"] = "";
      return;
    }
    const offered = phone.current.snapshot.me.choices;
    const key = offered.map((word) => word.text).join("|");
    if (choices.dataset["key"] === key) {
      return;
    }
    choices.dataset["key"] = key;
    const title = el("p", "ch-t", t.chooseTitle);
    choices.replaceChildren(
      title,
      ...offered.map((word, index) => {
        const button = el("button", `choice lv${word.level}`);
        button.type = "button";
        button.style.setProperty("--r", tilt(index + 4));
        const details = [t.level(word.level), t.factor(word.level)];
        if (word.authors.length > 0) {
          details.push(t.ownWordBy(t.list(word.authors.map((author) => nameOf(author, players)))));
        }
        button.append(el("span", "cw", word.text), el("small", "", details.join(" · ")));
        button.addEventListener("click", () => {
          if (moves.some((move) => move.type === "choose" && move.pick === index)) {
            void phone.move({ type: "choose", pick: index });
          }
        });
        return button;
      }),
    );
  }

  function renderCells(current: Public): void {
    const known = solution(current, phone === undefined ? undefined : { solved });
    const list = hintCells(current.hint, known);
    const key = `${current.hint}|${known ?? ""}|${cells.clientWidth}`;
    if (cells.dataset["key"] === key) {
      return;
    }
    cells.dataset["key"] = key;
    const letters = hintLetters(list);
    const largest = tv ? Math.round(Number.parseFloat(getComputedStyle(root).fontSize) * 2.4) : 30;
    const size = cellWidth(list.length, Math.max(100, cells.clientWidth - 52), largest);
    cells.style.setProperty("--cw", `${size}px`);
    cells.classList.toggle("solved", known !== null);
    cells.setAttribute("aria-label", t.hintLabel(letters, list.map((cell) => (cell.shown ? cell.char : "_")).join(" ")));
    cells.replaceChildren(
      ...list.map((cell, index) => {
        const box = el("span", cell.open ? "gap" : cell.shown ? "on" : "", cell.open ? cell.char.trim() : cell.char);
        box.style.setProperty("--r", index % 2 === 0 ? "-1deg" : "0.6deg");
        return box;
      }),
      el("em", "", t.letters(letters)),
    );
  }

  function renderNotes(current: Public): void {
    const list = notes(current, own, chat, seat, players, t);
    const key = turnKey(current);
    if (notesTurn !== key) {
      notesTurn = key;
      renderedNotes = new Map();
      notesBox.replaceChildren();
    }
    let added = false;
    for (const note of list) {
      if (!renderedNotes.has(note.key)) {
        const node = noteEl(note, t, false);
        renderedNotes.set(note.key, node);
        notesBox.append(node);
        added = true;
      }
    }
    if (added) {
      notesBox.scrollTop = notesBox.scrollHeight;
    }
    const stripKey = `${key}|${list.map((note) => note.key).join(",")}`;
    if (strip.dataset["key"] === stripKey) {
      return;
    }
    strip.dataset["key"] = stripKey;
    const recent = list.slice(-6).reverse();
    stripCount.replaceChildren(iconEl("up"), document.createTextNode(t.tipsCount(list.length)));
    stripNotes.replaceChildren(...recent.map((note) => noteEl(note, t, true)));
    const others = list.filter((note) => note.kind !== "near").slice(-8).reverse();
    seenNotes.replaceChildren(...(others.length === 0 ? [el("span", "none", t.noTipsYet)] : others.map((note) => noteEl(note, t, true))));
  }

  function standingRow(row: Standing, current: Public, withGain: boolean): HTMLElement {
    const node = el("div", `row ${row.seat === seat ? "mine" : ""}`);
    const badge = row.seat === current.drawer ? "draw" : current.guessed.includes(row.seat) || current.authors.includes(row.seat) ? "ok" : undefined;
    node.append(el("span", "pl", t.place(row.place)), avatar(row.seat, players, current.phase === "draw" || current.phase === "reveal" ? badge : undefined, true), el("span", "nm", row.seat === seat ? t.you : row.name));
    if (withGain) {
      const gainText = row.gained > 0 ? t.plus(row.gained) : "–";
      node.append(el("span", `gn ${row.gained > 0 ? "up" : ""}`, row.seat === current.drawer ? `${t.drawerTag} ${gainText}` : gainText));
    }
    node.append(el("span", "sc", String(row.score)));
    return node;
  }

  function renderBoard(current: Public): void {
    const withGain = current.phase === "reveal";
    const rows = withGain ? turnRows(current, players) : standings(current, players);
    const key = JSON.stringify([rows, current.phase, current.guessed, current.drawer, seat]);
    if (board.dataset["key"] === key) {
      return;
    }
    board.dataset["key"] = key;
    board.replaceChildren(el("p", "bt", t.scores), ...rows.map((row) => standingRow(row, current, withGain)));
  }

  function renderPlayers(current: Public): void {
    const rows = Object.keys(current.scores);
    const key = JSON.stringify([current.scores, current.guessed, current.drawer, current.authors]);
    if (playersRow.dataset["key"] === key) {
      return;
    }
    playersRow.dataset["key"] = key;
    playersRow.replaceChildren(
      ...rows.map((other) => {
        const chip = el("div", `pl ${other === seat ? "me" : ""}`);
        const badge = other === current.drawer ? "draw" : current.guessed.includes(other) || current.authors.includes(other) ? "ok" : undefined;
        chip.append(avatar(other, players, current.phase === "draw" ? badge : undefined), el("span", "pn", other === seat ? t.you : nameOf(other, players)), el("span", "ps", String(current.scores[other] ?? 0)));
        return chip;
      }),
    );
  }

  function renderTop(current: Public): void {
    const drawerSeat = current.drawer;
    const round = t.round(Math.min(current.round, current.rounds), current.rounds);
    const label = t.secondsLeft(secondsLeft(current.ticksLeft));
    ringDraw.set(current.ticksLeft, current.phaseTicks, label);
    ringInfo.set(current.ticksLeft, current.phaseTicks, label);
    ringSide.set(current.ticksLeft, current.phaseTicks, label);
    roundDraw.textContent = round;
    roundSide.textContent = round;
    if (phone !== undefined && current.drawer === seat && current.phase === "draw") {
      const word = phone.current.snapshot.me.word;
      myWord.textContent = word?.text ?? "";
      const length = [...(word?.text ?? "")].length;
      myWord.classList.toggle("long", length > 9 && length <= 13);
      myWord.classList.toggle("longer", length > 13);
      myLevel.textContent = word === null ? "" : `${t.level(word.level)} · ${t.factor(word.level)}`;
    }
    const avKey = `${drawerSeat ?? ""}|${nameOf(drawerSeat, players)}`;
    if (drawerAv.dataset["key"] !== avKey) {
      drawerAv.dataset["key"] = avKey;
      drawerAv.replaceChildren(...(drawerSeat === null ? [] : [avatar(drawerSeat, players, "draw")]));
      sideAv.replaceChildren(...(drawerSeat === null ? [] : [avatar(drawerSeat, players, "draw")]));
    }
    const line = headline(current, seat, players, t);
    const whoKey = `${line.strong}|${line.rest}`;
    if (whoLine.dataset["key"] !== whoKey) {
      whoLine.dataset["key"] = whoKey;
      whoLine.replaceChildren(el("b", "", line.strong), document.createTextNode(line.rest));
    }
    const sub = [round, ...(seat === null ? [] : [t.pointsShort(current.scores[seat] ?? 0)])].join(" · ");
    if (whoSub.textContent !== sub) {
      whoSub.textContent = sub;
    }
    const others = Object.keys(current.scores).filter((other) => other !== drawerSeat);
    const shown = tv ? others : others.slice(0, 4);
    const miniKey = JSON.stringify([shown, current.guessed, current.authors, current.phase]);
    if (mini.dataset["key"] !== miniKey) {
      mini.dataset["key"] = miniKey;
      mini.replaceChildren(
        ...shown.map((other) => avatar(other, players, current.phase === "draw" && (current.guessed.includes(other) || current.authors.includes(other)) ? "ok" : undefined, true)),
        ...(others.length > shown.length ? [el("span", "more", `+${others.length - shown.length}`)] : []),
      );
    }
  }

  function renderSheetText(current: Public): void {
    sheet.setAttribute("aria-label", current.drawer === null ? t.sheet : t.sheetOf(nameOf(current.drawer, players)));
    if (current.phase === "choose" && current.drawer !== seat) {
      sheetMsg.textContent = t.choosingLong(nameOf(current.drawer, players));
    } else {
      sheetMsg.textContent = "";
    }
    if (current.phase === "reveal") {
      const key = `${current.word ?? ""}|${current.ended ?? ""}|${turnKey(current)}`;
      if (reveal.dataset["key"] !== key) {
        reveal.dataset["key"] = key;
        const note = el("div", "rv");
        note.append(el("small", "", t.wordWas), el("b", "", current.word ?? ""), el("span", "", endedLine(current, players, t)), el("em", "", nextLine(current, seat, players, t)));
        reveal.replaceChildren(note);
      }
    } else if (reveal.dataset["key"] !== "") {
      reveal.dataset["key"] = "";
      reveal.replaceChildren();
    }
  }

  function renderWait(current: Public): void {
    if (seat === null) {
      return;
    }
    const role = roleOf(current, seat);
    const left = waitingFor(current, Object.keys(current.scores));
    const key = JSON.stringify([role, left, current.scores[seat] ?? 0, inLead(current.scores, seat), solved]);
    if (wait.dataset["key"] === key) {
      return;
    }
    wait.dataset["key"] = key;
    wait.replaceChildren();
    const faces = el("div", "wavs");
    faces.append(...left.slice(0, 3).map((other) => avatar(other, players, undefined, true)));
    const textBox = el("div");
    if (role === "author") {
      textBox.append(el("span", "", t.authorNote(solved.join(""))));
    } else {
      textBox.append(el("span", "", left.length === 0 ? t.allDone : t.stillGuessing(left.map((other) => nameOf(other, players)))));
      if (left.length > 0) {
        const dots = el("span", "dots3");
        dots.append(el("b"), el("b"), el("b"));
        textBox.append(dots);
      }
    }
    textBox.append(el("small", "", t.scoreLine(current.scores[seat] ?? 0, inLead(current.scores, seat))));
    wait.append(faces, textBox);
  }

  function renderPodium(current: Public): void {
    if (result === undefined) {
      return;
    }
    const key = JSON.stringify([result.winners, current.scores]);
    if (podiumPanel.dataset["key"] === key) {
      return;
    }
    podiumPanel.dataset["key"] = key;
    const rows = standings(current, players);
    const parts = podium(rows);
    const title = el("h2", "hand", winnerLine(result.winners, seat, players, t));
    const stage = el("div", "stage");
    stage.hidden = result.winners.length === 0;
    const step = (place: number, group: Standing[]) => {
      const column = el("div", `step p${place}`);
      const faces = el("div", "faces");
      faces.append(...group.map((row) => avatar(row.seat, players)));
      const names = el("div", "names", group.map((row) => (row.seat === seat ? t.you : row.name)).join(", "));
      const score = el("div", "pts", group.length > 0 ? t.points(group[0]?.score ?? 0) : "");
      const block = el("div", "block", group.length > 0 ? t.place(place) : "");
      column.append(faces, names, score, block);
      column.classList.toggle("empty", group.length === 0);
      return column;
    };
    stage.append(step(2, parts.second), step(1, parts.first), step(3, parts.third));
    const restList = el("div", "rest-list");
    restList.append(...(result.winners.length === 0 ? rows : parts.rest).map((row) => standingRow(row, current, false)));
    podiumPanel.replaceChildren(el("p", "bt", t.finalScore), title, stage, restList);
    if (!podiumShown && result.winners.length > 0) {
      podiumShown = true;
      confetti(confettiLayer, 60);
    }
  }

  function render(): void {
    const current = view;
    if (current === undefined) {
      return;
    }
    const role = roleOf(current, seat);
    const mode = result !== undefined ? "end" : current.phase;
    const drawing = isDrawer();
    if (drawing && localKey !== turnKey(current)) {
      localKey = turnKey(current);
      sync.start(current.pic, current.ops);
      tool = "pen";
      renderTools();
    }
    if (!drawing) {
      localKey = "";
      activePointer = undefined;
      nib.classList.remove("on");
    }
    if (window.innerWidth !== tallest.width) {
      tallest = { width: window.innerWidth, height: window.innerHeight };
    }
    tallest.height = Math.max(tallest.height, window.innerHeight);
    const portrait = window.innerWidth <= tallest.height * 1.1;
    const canType = phone !== undefined && current.phase === "draw" && role !== "drawer";
    if (!canType && typing) {
      typing = false;
      input.blur();
    }
    const won = current.phase === "draw" && seat !== null && current.guessed.includes(seat);
    if (won && wonTurn !== turnKey(current)) {
      const fresh = rendered;
      wonTurn = turnKey(current);
      stampPoints.textContent = t.plus(current.gained[seat ?? ""] ?? 0);
      if (fresh) {
        stamp.classList.remove("pop");
        void stamp.offsetWidth;
        stamp.classList.add("pop");
        confetti(confettiLayer, 36);
      }
    }
    const classes = [
      "game",
      "paper",
      tv ? "tv" : "phone",
      `m-${mode}`,
      `r-${role}`,
      typing && canType && portrait ? "typing" : "",
      won ? "win" : "",
    ].filter((name) => name !== "");
    const wide = tv || !portrait;
    if (wide) {
      classes.push("wide");
    }
    if (root.clientWidth < 350) {
      classes.push("narrow");
    }
    const className = classes.join(" ");
    if (root.className !== className) {
      root.className = className;
    }
    if (mode === "words") {
      renderWords(current);
    }
    if (mode === "end") {
      renderPodium(current);
    }
    renderTop(current);
    renderSheetText(current);
    renderChoices(current);
    if (current.phase === "draw" || current.phase === "reveal") {
      renderCells(current);
    }
    renderNotes(current);
    renderBoard(current);
    if (role === "drawer") {
      renderPlayers(current);
    }
    if (current.phase === "draw" && (role === "guessed" || role === "author")) {
      renderWait(current);
    }
    input.placeholder = role === "guesser" ? t.guessPlaceholder : t.chatPlaceholder;
    input.setAttribute("aria-label", role === "guesser" ? t.guessLabel : t.chatLabel);
    renderInk();
    rendered = true;
    const nextKey = `${className}|${root.clientWidth}x${root.clientHeight}|${current.phase}|${role}|${typing}`;
    if (nextKey !== layoutKey) {
      layoutKey = nextKey;
      requestAnimationFrame(layout);
    }
  }

  function visibleHeight(node: HTMLElement): number {
    return node.offsetParent === null && getComputedStyle(node).position !== "fixed" ? 0 : node.offsetHeight;
  }

  function layout(): void {
    const style = getComputedStyle(root);
    const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const width = root.clientWidth - padX;
    let size: number;
    if (root.classList.contains("typing")) {
      const height = typingHeight(window.innerHeight, tallest.height, window.visualViewport?.height);
      root.style.setProperty("--typing-h", `${height}px`);
      const restUsed = [cells, strip, guessRow, wait].reduce((sum, node) => sum + visibleHeight(node), 0) + 3 * gap;
      size = Math.max(120, Math.min(width - 76 - 10, height - padY - restUsed - gap));
    } else if (root.classList.contains("wide")) {
      const height = root.clientHeight - padY;
      size = Math.max(120, Math.floor(Math.min(height, width * (tv ? 0.6 : 0.52))));
    } else {
      const height = root.clientHeight - padY;
      const rows = [topDraw, topInfo, playersRow, cells, seen, notesBox, board, wait, inkFull, guessRow, dock];
      const fill = [notesBox, board].filter((node) => visibleHeight(node) > 0 || getComputedStyle(node).display !== "none");
      const fixed = rows.filter((node) => !fill.includes(node) && getComputedStyle(node).display !== "none");
      const used = fixed.reduce((sum, node) => sum + node.offsetHeight, 0) + (fixed.length + (fill.length > 0 ? 1 : 0)) * gap;
      size = sheetSize(width, height, used, fill.length > 0 ? 76 : 0);
    }
    root.style.setProperty("--sheet", `${size}px`);
    painter.resize(size, window.devicePixelRatio || 1);
    if (view !== undefined) {
      cells.dataset["key"] = "";
      if (view.phase === "draw" || view.phase === "reveal") {
        renderCells(view);
      }
    }
  }

  function frame(now: number): void {
    const current = view;
    if (current !== undefined) {
      if (isDrawer()) {
        painter.paint(sync.local);
        playback.update(sync.local, now);
      } else {
        playback.update(current.pic, now);
        painter.paint(current.pic.slice(0, playback.length(now)));
      }
    }
    requestAnimationFrame(frame);
  }

  const resize = () => {
    layoutKey = "";
    render();
  };
  new ResizeObserver(resize).observe(root);
  window.visualViewport?.addEventListener("resize", resize);

  const receive = (update: { snapshot: { public: Public; result?: { winners: string[] } }; players: Players }, me?: { feed: Entry[]; chat: Chat[]; solved: string[] }, legal?: KritzelAction[]) => {
    const wasPic = view?.pic;
    view = update.snapshot.public;
    players = update.players;
    result = update.snapshot.result;
    own = me?.feed ?? [];
    chat = me?.chat ?? [];
    solved = me?.solved ?? [];
    moves = legal ?? [];
    if (isDrawer() && localKey === turnKey(view)) {
      sync.observe(view.pic, view.ops);
    }
    render();
    if (wasPic !== view.pic) {
      pump();
    }
  };
  if (phone !== undefined) {
    phone.onUpdate((update) => receive(update, update.snapshot.me, update.snapshot.moves));
  } else {
    (game as TvGame).onUpdate((update) => receive(update));
  }
  renderTools();
  requestAnimationFrame(frame);
}
