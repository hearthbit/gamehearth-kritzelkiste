import { charToValue, decodeCoordinate, fillMark, isMark, pictureSize, styleInk, styleWidth } from "../../src/picture";
import { Raster } from "./raster";
import { inkColors } from "./view";

interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
  value: number;
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly raster = new Raster(pictureSize);
  private readonly context: CanvasRenderingContext2D;
  private readonly scratch = document.createElement("canvas");
  private scale = 1;
  private painted = "";
  private text = "";
  private style = -1;
  private last: [number, number] | undefined;
  private queue: Segment[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("No 2D canvas");
    }
    this.context = context;
  }

  resize(cssSize: number, pixelRatio: number): void {
    const pixels = Math.max(1, Math.round(cssSize * Math.min(Math.max(pixelRatio, 1), 3)));
    if (pixels === this.canvas.width && pixels === this.canvas.height) {
      return;
    }
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.scale = pixels / pictureSize;
    const text = this.text;
    this.reset();
    this.paint(text);
  }

  get shown(): string {
    return this.painted;
  }

  paint(text: string): void {
    this.text = text;
    if (!text.startsWith(this.painted)) {
      this.reset();
    }
    let index = this.painted.length;
    while (index < text.length) {
      const char = text[index];
      if (isMark(char)) {
        if (char === fillMark) {
          if (index + 6 > text.length) {
            break;
          }
          this.fillAt(charToValue(text[index + 1]), decodeCoordinate(text, index + 2), decodeCoordinate(text, index + 4));
          this.style = -1;
          index += 6;
          continue;
        }
        if (index + 2 > text.length) {
          break;
        }
        this.style = charToValue(text[index + 1]);
        this.last = undefined;
        index += 2;
        continue;
      }
      if (index + 4 > text.length) {
        break;
      }
      this.point(decodeCoordinate(text, index), decodeCoordinate(text, index + 2));
      index += 4;
    }
    this.painted = text.slice(0, index);
  }

  wouldFill(x: number, y: number, color: number): boolean {
    this.flush();
    return this.raster.at(x, y) !== color + 1;
  }

  private reset(): void {
    this.painted = "";
    this.style = -1;
    this.last = undefined;
    this.queue = [];
    this.raster.clear();
    this.context.fillStyle = inkColors[0] ?? "#fff";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private point(x: number, y: number): void {
    if (this.style < 0) {
      return;
    }
    const width = styleWidth(this.style);
    const value = styleInk(this.style);
    const context = this.context;
    const scale = this.scale;
    context.fillStyle = inkColors[value] ?? "#000";
    context.strokeStyle = context.fillStyle;
    const previous = this.last;
    if (previous === undefined) {
      context.beginPath();
      context.arc((x + 0.5) * scale, (y + 0.5) * scale, (width / 2) * scale, 0, Math.PI * 2);
      context.fill();
    } else {
      context.lineWidth = width * scale;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo((previous[0] + 0.5) * scale, (previous[1] + 0.5) * scale);
      context.lineTo((x + 0.5) * scale, (y + 0.5) * scale);
      context.stroke();
    }
    const from = previous ?? [x, y];
    this.queue.push({ x0: from[0], y0: from[1], x1: x, y1: y, radius: width / 2, value });
    this.last = [x, y];
  }

  private flush(): void {
    for (const segment of this.queue) {
      this.raster.segment(segment.x0, segment.y0, segment.x1, segment.y1, segment.radius, segment.value);
    }
    this.queue = [];
  }

  private fillAt(color: number, x: number, y: number): void {
    this.flush();
    const value = color + 1;
    const area = this.raster.fill(x, y, value);
    if (area === undefined) {
      return;
    }
    const left = area.left - 1;
    const top = area.top - 1;
    const width = area.right - area.left + 3;
    const height = area.bottom - area.top + 3;
    const image = new ImageData(width, height);
    const [r, g, b] = rgb(inkColors[value] ?? "#000000");
    const pixels = image.data;
    for (let index = 0; index < area.spans.length; index += 3) {
      const row = (area.spans[index] ?? 0) - top;
      const from = (area.spans[index + 1] ?? 0) - left;
      const to = (area.spans[index + 2] ?? 0) - left;
      for (let column = from; column <= to; column++) {
        const at = (row * width + column) * 4;
        pixels[at] = r;
        pixels[at + 1] = g;
        pixels[at + 2] = b;
        pixels[at + 3] = 255;
      }
    }
    this.scratch.width = width;
    this.scratch.height = height;
    this.scratch.getContext("2d")?.putImageData(image, 0, 0);
    const scale = this.scale;
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.context.drawImage(this.scratch, left * scale, top * scale, width * scale, height * scale);
  }
}
