import { countFills, cutPicture, encodeFill, encodePoint, inkUsed, maxFills, maxInk, planSync, strokeMark, styleChar, type SyncAction } from "../../src/picture";

export const resendMs = 300;

export class DrawerSync {
  local = "";
  base = "";
  ops = 0;
  private lastPlan = "";
  private lastTick = -1;
  private lastSent = Number.NEGATIVE_INFINITY;
  private lastServer: string | undefined;
  private stuck = 0;

  start(server: string, ops: number): void {
    this.local = server;
    this.base = server;
    this.ops = ops;
    this.lastPlan = "";
    this.lastServer = undefined;
    this.stuck = 0;
  }

  get pending(): boolean {
    return this.local !== this.base;
  }

  get full(): boolean {
    return inkUsed(this.local, this.ops) >= maxInk;
  }

  get fillsFull(): boolean {
    return countFills(this.local) >= maxFills;
  }

  observe(server: string, ops: number): void {
    if (!this.pending) {
      this.start(server, ops);
    } else if (this.local === server) {
      this.base = server;
    }
  }

  begin(style: number, x: number, y: number): boolean {
    if (this.full) {
      return false;
    }
    this.local += `${strokeMark}${styleChar(style)}${encodePoint(x, y)}`;
    this.ops += 1;
    return true;
  }

  point(x: number, y: number): boolean {
    if (this.full) {
      return false;
    }
    this.local += encodePoint(x, y);
    return true;
  }

  fill(color: number, x: number, y: number): boolean {
    if (this.full || this.fillsFull) {
      return false;
    }
    this.local += encodeFill(color, x, y);
    this.ops += 1;
    return true;
  }

  undo(): boolean {
    if (this.ops === 0) {
      return false;
    }
    this.local = cutPicture(this.local, this.ops - 1);
    this.ops -= 1;
    return true;
  }

  clear(): void {
    this.local = "";
    this.ops = 0;
  }

  next(server: string, ops: number, tick: number, now: number): SyncAction | undefined {
    if (!this.pending) {
      return undefined;
    }
    const plan = planSync(server, this.local);
    if (plan === undefined) {
      this.base = this.local;
      return undefined;
    }
    if (server === this.lastServer && now - this.lastSent < resendMs) {
      return undefined;
    }
    const key = `${JSON.stringify(plan)}@${server.length}`;
    if (key !== this.lastPlan) {
      this.lastPlan = key;
      this.lastTick = tick;
      this.stuck = 0;
    } else if (tick > this.lastTick + 2) {
      this.lastTick = tick;
      this.stuck += 1;
      if (this.stuck >= 3) {
        this.start(server, ops);
        return undefined;
      }
    }
    this.lastServer = server;
    this.lastSent = now;
    return plan;
  }
}
