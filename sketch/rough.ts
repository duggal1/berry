import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import { INK } from "./palette";

export const GRID = 8;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

const SKETCH = {
  roughness: 0.7,
  bowing: 0.5,
  maxRandomnessOffset: 1.2,
  disableMultiStroke: true,
  strokeWidth: 1.5,
  fillStyle: "hachure",
  hachureAngle: -41,
  hachureGap: 6,
  fillWeight: 0.9,
} as const;

/** Stable per shape, so a drawing never jitters between renders. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

const gen = rough.generator();

export type RPath = { d: string; hatch: boolean };

const MAX_CACHED_SHAPES = 2000;
const cache = new Map<string, RPath[]>();

function build(
  key: string,
  id: string,
  color: string | null,
  make: (o: Options) => Drawable[],
): RPath[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const opts: Options = {
    ...SKETCH,
    seed: seedOf(id),
    stroke: INK,
    ...(color ? { fill: color } : {}),
  };
  const out = make(opts)
    .flatMap((dr) => gen.toPaths(dr))
    .filter((p) => p.d)
    .map((p) => ({ d: p.d, hatch: color !== null && p.stroke === color }));
  // Keep repeated diagram sessions from retaining unbounded SVG path data.
  if (cache.size >= MAX_CACHED_SHAPES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, out);
  return out;
}

export const rectPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`r:${id}:${w}:${h}:${color}`, id, color, (o) => [gen.rectangle(0, 0, w, h, o)]);

export const entryPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`entry:${id}:${w}:${h}:${color}`, id, color, (o) => [
    gen.path(`M0 0 H${w - 18} L${w} ${h / 2} L${w - 18} ${h} H0 Z`, o),
  ]);

export const integrationPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`integration:${id}:${w}:${h}:${color}`, id, color, (o) => [
    gen.path(`M14 0 H${w - 14} L${w} ${h / 2} L${w - 14} ${h} H14 L0 ${h / 2} Z`, o),
  ]);

export const utilityPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`utility:${id}:${w}:${h}:${color}`, id, color, (o) => [
    gen.path(`M10 0 H${w - 10} Q${w} 0 ${w} 10 V${h - 10} Q${w} ${h} ${w - 10} ${h} H10 Q0 ${h} 0 ${h - 10} V10 Q0 0 10 0 Z`, o),
  ]);

export const documentPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`document:${id}:${w}:${h}:${color}`, id, color, (o) => [
    gen.path(`M0 0 H${w - 18} L${w} 18 V${h} H0 Z M${w - 18} 0 V18 H${w}`, o),
  ]);

export const queuePaths = (id: string, w: number, h: number, color: string | null) =>
  build(`q:${id}:${w}:${h}:${color}`, id, color, (o) => [
    gen.rectangle(0, 0, w, h, o),
    ...[0, 1, 2].map((k) =>
      gen.line(w - 44 + k * 12, 16, w - 44 + k * 12, h - 16, {
        ...o,
        seed: (o.seed ?? 1) + k + 1,
      }),
    ),
  ]);

export const cylinderPaths = (id: string, w: number, h: number, color: string | null) =>
  build(`c:${id}:${w}:${h}:${color}`, id, color, (o) => {
    const ry = 10;
    const rx = w / 2;
    const body = `M0 ${ry} L0 ${h - ry} A${rx} ${ry} 0 0 0 ${w} ${h - ry} L${w} ${ry}`;
    return [gen.path(body, o), gen.ellipse(rx, ry, w, ry * 2, { ...o, fill: undefined })];
  });

export const polyPaths = (id: string, pts: [number, number][]) =>
  build(`p:${id}:${pts.join("|")}`, id, null, (o) => [gen.linearPath(pts, o)]);

export function arrowPaths(id: string, a: [number, number], b: [number, number]): RPath[] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const t = (25 * Math.PI) / 180;
  const L = 10;
  const p1: [number, number] = [b[0] - L * Math.cos(ang - t), b[1] - L * Math.sin(ang - t)];
  const p2: [number, number] = [b[0] - L * Math.cos(ang + t), b[1] - L * Math.sin(ang + t)];
  return polyPaths(`${id}:head`, [p1, b, p2]);
}
