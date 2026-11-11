import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { Edge, Module } from "@/lib/schema";
import { snap } from "./rough";

export type PNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  m: Module;
  depth: number;
};
export type PEdge = { e: Edge; pts: [number, number][]; d: string; lx: number; ly: number };
export type PGroup = { name: string; x: number; y: number; w: number; h: number };
export type Laid = { w: number; h: number; nodes: PNode[]; edges: PEdge[]; groups: PGroup[] };

const elk = new ELK();

export const labelW = (s: string) => Math.ceil(s.length * 6.7) + 12;

function size(m: Module) {
  const base = Math.max(m.name.length * 9.6, m.path.length * 7) + 40 + (m.kind === "queue" ? 36 : 0);
  return { width: Math.max(176, snap(base)), height: m.kind === "datastore" ? 80 : 72 };
}

export async function layout(modules: Module[], edges: Edge[]): Promise<Laid> {
  const ids = new Set(modules.map((m) => m.id));
  const real = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "112",
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]",
    },
    children: modules.map((m) => ({ id: m.id, ...size(m) })),
    edges: real.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const out = await elk.layout(root);

  const byId = new Map(modules.map((m) => [m.id, m]));
  const placed = (out.children ?? []).map((c) => ({
    id: c.id,
    x: snap(c.x ?? 0),
    y: snap(c.y ?? 0),
    w: c.width ?? 176,
    h: c.height ?? 72,
    m: byId.get(c.id)!,
  }));

  const xs = [...new Set(placed.map((p) => p.x))].sort((a, b) => a - b);
  const nodes: PNode[] = placed.map((p) => ({ ...p, depth: xs.indexOf(p.x) }));

  const pe: PEdge[] = real.flatMap((e) => {
    const s = (out.edges ?? []).find((x) => x.id === e.id)?.sections?.[0];
    if (!s) return [];
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(
      (p): [number, number] => [snap(p.x), snap(p.y)],
    );
    let best = 0;
    let lx = pts[0][0];
    let ly = pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const len =
        Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      if (len > best) {
        best = len;
        lx = (pts[i][0] + pts[i - 1][0]) / 2;
        ly = (pts[i][1] + pts[i - 1][1]) / 2;
      }
    }
    return [
      {
        e,
        pts,
        lx,
        ly,
        d: pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "),
      },
    ];
  });

  const groups: PGroup[] = [...new Set(modules.map((m) => m.group).filter(Boolean))].flatMap(
    (name) => {
      const g = nodes.filter((n) => n.m.group === name);
      if (g.length < 2) return [];
      const x0 = Math.min(...g.map((n) => n.x)) - 24;
      const y0 = Math.min(...g.map((n) => n.y)) - 36;
      const x1 = Math.max(...g.map((n) => n.x + n.w)) + 24;
      const y1 = Math.max(...g.map((n) => n.y + n.h)) + 24;
      return [{ name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    },
  );

  return {
    w: snap(out.width ?? 800),
    h: snap(out.height ?? 440),
    nodes,
    edges: pe,
    groups,
  };
}
