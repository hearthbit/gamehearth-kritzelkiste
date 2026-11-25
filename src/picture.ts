export const pictureSize = 600;
export const maxInk = 6000;
export const maxFills = 100;
export const chunkPoints = 64;
export const pointChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
export const strokeMark = "!";
export const fillMark = "*";
export const colorCount = 10;
export const widthCount = 3;
export const eraserStyle = colorCount * widthCount;
export const styleCount = eraserStyle + widthCount;
export const penWidths = [5, 11, 24] as const;
export const eraserWidths = [14, 28, 52] as const;

export type OpKind = "stroke" | "fill";

export interface PictureOp {
  kind: OpKind;
  style: number;
  points: number[];
}

export interface PictureTail {
  ops: number;
  kind: OpKind | null;
  style: number;
  points: number;
}

const charValue: Record<string, number> = Object.fromEntries([...pointChars].map((char, index) => [char, index]));

export function styleChar(style: number): string {
  return pointChars[style] ?? "0";
}

export function charToValue(char: string | undefined): number {
  return char === undefined ? 0 : (charValue[char] ?? 0);
}

export function penStyle(color: number, width: number): number {
  return color * widthCount + width;
}

export function eraserStyleOf(width: number): number {
  return eraserStyle + width;
}

export function isEraser(style: number): boolean {
  return style >= eraserStyle;
}

export function styleWidth(style: number): number {
  return isEraser(style) ? (eraserWidths[style - eraserStyle] ?? eraserWidths[0]) : (penWidths[style % widthCount] ?? penWidths[0]);
}

export function styleInk(style: number): number {
  return isEraser(style) ? 0 : Math.floor(style / widthCount) + 1;
}

export function clampCoordinate(value: number): number {
  return Math.min(pictureSize - 1, Math.max(0, Math.round(value)));
}

export function encodePoint(x: number, y: number): string {
  const cx = clampCoordinate(x);
  const cy = clampCoordinate(y);
  return `${pointChars[cx >> 6]}${pointChars[cx & 63]}${pointChars[cy >> 6]}${pointChars[cy & 63]}`;
}

export function decodeCoordinate(text: string, at: number): number {
  return Math.min(pictureSize - 1, charToValue(text[at]) * 64 + charToValue(text[at + 1]));
}

export function decodePoints(text: string): number[] {
  const points: number[] = [];
  for (let at = 0; at + 4 <= text.length; at += 4) {
    points.push(decodeCoordinate(text, at), decodeCoordinate(text, at + 2));
  }
  return points;
}

export function canonicalPoints(text: string, limit: number): string {
  const count = Math.min(Math.floor(text.length / 4), Math.max(0, limit));
  let result = "";
  for (let index = 0; index < count; index++) {
    result += encodePoint(decodeCoordinate(text, index * 4), decodeCoordinate(text, index * 4 + 2));
  }
  return result;
}

export function isMark(char: string | undefined): boolean {
  return char === strokeMark || char === fillMark;
}

export function inkUsed(text: string, ops: number): number {
  return (text.length - 2 * ops) / 4;
}

export function countOps(text: string): number {
  let ops = 0;
  for (let index = 0; index < text.length; index++) {
    if (isMark(text[index])) {
      ops += 1;
    }
  }
  return ops;
}

export function countFills(text: string): number {
  let fills = 0;
  for (let index = text.indexOf(fillMark); index >= 0; index = text.indexOf(fillMark, index + 1)) {
    fills += 1;
  }
  return fills;
}

export function lastMark(text: string): number {
  return Math.max(text.lastIndexOf(strokeMark), text.lastIndexOf(fillMark));
}

export function pictureTail(text: string, ops: number): PictureTail {
  const at = lastMark(text);
  if (at < 0) {
    return { ops, kind: null, style: 0, points: 0 };
  }
  return {
    ops,
    kind: text[at] === fillMark ? "fill" : "stroke",
    style: charToValue(text[at + 1]),
    points: (text.length - at - 2) / 4,
  };
}

export function cutPicture(text: string, keep: number): string {
  if (keep <= 0) {
    return "";
  }
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (isMark(text[index])) {
      if (seen === keep) {
        return text.slice(0, index);
      }
      seen += 1;
    }
  }
  return text;
}

export function splitOps(text: string): string[] {
  const ops: string[] = [];
  let start = -1;
  for (let index = 0; index < text.length; index++) {
    if (isMark(text[index])) {
      if (start >= 0) {
        ops.push(text.slice(start, index));
      }
      start = index;
    }
  }
  if (start >= 0) {
    ops.push(text.slice(start));
  }
  return ops;
}

export function parsePicture(text: string): PictureOp[] {
  return splitOps(text).map((op) => ({
    kind: op[0] === fillMark ? "fill" : "stroke",
    style: charToValue(op[1]),
    points: decodePoints(op.slice(2)),
  }));
}

export function encodeStroke(style: number, points: readonly number[]): string {
  let text = `${strokeMark}${styleChar(style)}`;
  for (let index = 0; index + 1 < points.length; index += 2) {
    text += encodePoint(points[index] ?? 0, points[index + 1] ?? 0);
  }
  return text;
}

export function encodeFill(color: number, x: number, y: number): string {
  return `${fillMark}${styleChar(color)}${encodePoint(x, y)}`;
}

export type SyncAction =
  | { type: "stroke"; op: number; at: number; style: number; points: string }
  | { type: "fill"; op: number; color: number; point: string }
  | { type: "cut"; keep: number };

function nextMark(text: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    if (isMark(text[index])) {
      return index;
    }
  }
  return text.length;
}

export function commonOps(server: string, local: string): number {
  const a = splitOps(server);
  const b = splitOps(local);
  let keep = 0;
  while (keep < a.length && keep < b.length && a[keep] === b[keep]) {
    keep += 1;
  }
  return keep;
}

export function planSync(server: string, local: string): SyncAction | undefined {
  if (server === local) {
    return undefined;
  }
  if (!local.startsWith(server)) {
    return { type: "cut", keep: commonOps(server, local) };
  }
  const rest = local.slice(server.length);
  const ops = countOps(server);
  if (!isMark(rest[0])) {
    const tail = pictureTail(server, ops);
    const end = Math.min(nextMark(rest, 0), chunkPoints * 4);
    return { type: "stroke", op: ops - 1, at: tail.points, style: tail.style, points: rest.slice(0, end - (end % 4)) };
  }
  if (rest[0] === fillMark) {
    return { type: "fill", op: ops, color: charToValue(rest[1]), point: rest.slice(2, 6) };
  }
  const end = Math.min(nextMark(rest, 2), 2 + chunkPoints * 4);
  return { type: "stroke", op: ops, at: 0, style: charToValue(rest[1]), points: rest.slice(2, end) };
}
