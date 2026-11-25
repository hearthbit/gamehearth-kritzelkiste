export interface FillArea {
  spans: number[];
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class Raster {
  readonly size: number;
  readonly data: Uint8Array;

  constructor(size: number) {
    this.size = size;
    this.data = new Uint8Array(size * size);
  }

  clear(): void {
    this.data.fill(0);
  }

  at(x: number, y: number): number {
    return this.data[y * this.size + x] ?? 0;
  }

  segment(x0: number, y0: number, x1: number, y1: number, radius: number, value: number): void {
    const size = this.size;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1) + radius));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1) + radius));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = dx * dx + dy * dy;
    const limit = radius * radius;
    for (let y = minY; y <= maxY; y++) {
      const row = y * size;
      for (let x = minX; x <= maxX; x++) {
        let t = length === 0 ? 0 : ((x - x0) * dx + (y - y0) * dy) / length;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x0 + t * dx - x;
        const ey = y0 + t * dy - y;
        if (ex * ex + ey * ey <= limit) {
          this.data[row + x] = value;
        }
      }
    }
  }

  fill(x: number, y: number, value: number): FillArea | undefined {
    const size = this.size;
    const data = this.data;
    const target = data[y * size + x];
    if (target === undefined || target === value) {
      return undefined;
    }
    const spans: number[] = [];
    const stack: number[] = [x, y];
    let left = x;
    let right = x;
    let top = y;
    let bottom = y;
    while (stack.length > 0) {
      const sy = stack.pop() as number;
      const sx = stack.pop() as number;
      const row = sy * size;
      if (data[row + sx] !== target) {
        continue;
      }
      let a = sx;
      let b = sx;
      while (a > 0 && data[row + a - 1] === target) {
        a -= 1;
      }
      while (b < size - 1 && data[row + b + 1] === target) {
        b += 1;
      }
      data.fill(value, row + a, row + b + 1);
      spans.push(sy, a, b);
      left = Math.min(left, a);
      right = Math.max(right, b);
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
      for (const ny of [sy - 1, sy + 1]) {
        if (ny < 0 || ny >= size) {
          continue;
        }
        const next = ny * size;
        let inside = false;
        for (let i = a; i <= b; i++) {
          const match = data[next + i] === target;
          if (match && !inside) {
            stack.push(i, ny);
          }
          inside = match;
        }
      }
    }
    return { spans, left, top, right, bottom };
  }
}
