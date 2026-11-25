import { describe, expect, it } from "vitest";
import {
  canonicalPoints,
  chunkPoints,
  countOps,
  cutPicture,
  decodePoints,
  encodeFill,
  encodePoint,
  encodeStroke,
  eraserStyleOf,
  inkUsed,
  isEraser,
  parsePicture,
  penStyle,
  pictureSize,
  pictureTail,
  planSync,
  styleInk,
  styleWidth,
} from "../src/picture";

describe("Picture as compact text", () => {
  it("encodes a point in 4 characters and clamps it to the picture", () => {
    expect(encodePoint(0, 0)).toBe("0000");
    expect(encodePoint(599, 64)).toHaveLength(4);
    expect(decodePoints(encodePoint(599, 64) + encodePoint(-5, 9999))).toEqual([599, 64, 0, pictureSize - 1]);
    expect(canonicalPoints("_____", 10)).toBe(encodePoint(599, 599));
  });

  it("knows strokes and fills with their colors, widths and the eraser", () => {
    const text = encodeStroke(penStyle(2, 1), [1, 2, 3, 4]) + encodeFill(5, 7, 8) + encodeStroke(eraserStyleOf(2), [9, 9]);
    expect(parsePicture(text)).toEqual([
      { kind: "stroke", style: penStyle(2, 1), points: [1, 2, 3, 4] },
      { kind: "fill", style: 5, points: [7, 8] },
      { kind: "stroke", style: eraserStyleOf(2), points: [9, 9] },
    ]);
    expect(countOps(text)).toBe(3);
    expect(inkUsed(text, 3)).toBe(4);
    expect(pictureTail(text, 3)).toEqual({ ops: 3, kind: "stroke", style: eraserStyleOf(2), points: 1 });
    expect(styleInk(penStyle(0, 0))).toBe(1);
    expect(styleInk(penStyle(9, 2))).toBe(10);
    expect(isEraser(eraserStyleOf(0))).toBe(true);
    expect(styleWidth(penStyle(3, 0))).toBeLessThan(styleWidth(penStyle(3, 2)));
    expect(cutPicture(text, 1)).toBe(encodeStroke(penStyle(2, 1), [1, 2, 3, 4]));
    expect(cutPicture(text, 0)).toBe("");
  });
});

describe("Sending the picture piece by piece", () => {
  const red = penStyle(2, 1);

  it("sends a new stroke, then only the points the server does not have yet", () => {
    const local = encodeStroke(red, [1, 1, 2, 2, 3, 3]);
    expect(planSync("", local)).toEqual({ type: "stroke", op: 0, at: 0, style: red, points: local.slice(2) });
    const server = encodeStroke(red, [1, 1]);
    expect(planSync(server, local)).toEqual({ type: "stroke", op: 0, at: 1, style: red, points: encodePoint(2, 2) + encodePoint(3, 3) });
    expect(planSync(local, local)).toBeUndefined();
  });

  it("sends long strokes in pieces of at most 64 points", () => {
    const points = Array.from({ length: 200 }, (_, index) => index);
    const plan = planSync("", encodeStroke(red, points));
    expect(plan?.type === "stroke" && plan.points.length).toBe(chunkPoints * 4);
  });

  it("finishes a stroke before it starts the next one and sends fills", () => {
    const first = encodeStroke(red, [1, 1, 2, 2]);
    const local = first + encodeFill(3, 50, 60) + encodeStroke(red, [5, 5]);
    expect(planSync(encodeStroke(red, [1, 1]), local)).toMatchObject({ type: "stroke", op: 0, at: 1 });
    expect(planSync(first, local)).toEqual({ type: "fill", op: 1, color: 3, point: encodePoint(50, 60) });
    expect(planSync(first + encodeFill(3, 50, 60), local)).toMatchObject({ type: "stroke", op: 2, at: 0 });
  });

  it("asks the server to cut back to the common part after undo or clear", () => {
    const a = encodeStroke(red, [1, 1]);
    const b = encodeStroke(red, [2, 2]);
    expect(planSync(a + b, a)).toEqual({ type: "cut", keep: 1 });
    expect(planSync(a + b, "")).toEqual({ type: "cut", keep: 0 });
    expect(planSync(a + b, a + encodeStroke(penStyle(4, 0), [7, 7]))).toEqual({ type: "cut", keep: 1 });
  });
});
