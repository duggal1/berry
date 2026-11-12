import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkEdgeSection, ElkNode } from "elkjs/lib/elk-api";
import type { Edge, Module, Story, StoryAction } from "@/lib/schema";
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
export type PEdge = {
  e: Edge;
  pts: [number, number][];
  d: string;
  lx: number;
  ly: number;
  dir: [number, number];
};
export type PGroup = { name: string; x: number; y: number; w: number; h: number };
export type Laid = { w: number; h: number; nodes: PNode[]; edges: PEdge[]; groups: PGroup[] };

const elk = new ELK();

export const LABEL_H = 22;
export const clipLabel = (s: string, max = 28) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
export const labelWidth = (s: string) => Math.ceil(clipLabel(s).length * 6.5) + 22;

type Rect = { x: number; y: number; w: number; h: number };

function clearance(a: Rect, b: Rect) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (dx > 0 || dy > 0) return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return Math.max(dx, dy);
}

/** Put the tag on its wire, or beside it, wherever there is the most clear room. */
function placeLabel(p: PEdge, nodes: Rect[], taken: Rect[]) {
  const w = labelWidth(p.e.label || p.e.kind);
  const h = LABEL_H;
  const side = h / 2 + 6;
  let bestScore = -Infinity;
  let bestGap = -Infinity;
  let bx = p.lx;
  let by = p.ly;

  const consider = (x: number, y: number, off: number) => {
    const rect = { x: x - w / 2, y: y - h / 2, w, h };
    let gap = 999;
    for (const n of nodes) gap = Math.min(gap, clearance(rect, n));
    for (const l of taken) gap = Math.min(gap, clearance(rect, l));
    const score = Math.min(gap, 40) - Math.hypot(x - p.lx, y - p.ly) * 0.05 - off * 7;
    if (score > bestScore) {
      bestScore = score;
      bestGap = gap;
      bx = x;
      by = y;
    }
  };

  const pts = p.pts;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const from = Math.min(18, len / 4);
    const to = len - Math.min(20, len / 4);
    for (let d = from; d <= to; d += 6) {
      const x = x0 + ux * d;
      const y = y0 + uy * d;
      consider(x, y, 0);
      consider(x - uy * side, y + ux * side, 1);
      consider(x + uy * side, y - ux * side, 1);
    }
  }

  p.lx = bx;
  p.ly = by;
  if (bestGap > 2) taken.push({ x: bx - w / 2, y: by - h / 2, w, h });
}

function size(m: Module) {
  const base =
    Math.max(m.name.length * 9.6, m.path.length * 7) +
    40 +
    (m.kind === "queue" ? 36 : 0) +
    (m.tech || m.domain ? 26 : 0);
  return { width: Math.max(176, snap(base)), height: m.kind === "datastore" ? 80 : 72 };
}

function moduleIdsForActions(actions: StoryAction[], edges: Edge[]): Set<string> {
  const result = new Set<string>();
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  for (const action of actions) {
    if (action.kind === "enter" || action.kind === "exit" || action.kind === "effect" || action.kind === "spawn") {
      result.add(action.moduleId);
      if (action.kind === "spawn") {
        const edge = edgeById.get(action.edgeId);
        if (edge) result.add(edge.to);
      }
    } else if (action.kind === "traverse" || action.kind === "return") {
      const edge = edgeById.get(action.edgeId);
      if (edge) {
        result.add(edge.from);
        result.add(edge.to);
      }
    }
  }
  return result;
}

export function storyEdgeIds(story: Story): Set<string> {
  const result = new Set<string>();
  for (const scene of story.scenes) {
    for (const action of scene.actions) {
      if (action.kind === "traverse" || action.kind === "return" || action.kind === "spawn") {
        result.add(action.edgeId);
      }
    }
  }
  return result;
}

function orderedByStory(modules: Module[], edges: Edge[], story: Story): Module[] {
  const scenesById = new Map(story.scenes.map((scene) => [scene.id, scene]));
  const sceneRanks = new Map<string, number>();
  const rankOf = (id: string, active = new Set<string>()): number => {
    const cached = sceneRanks.get(id);
    if (cached !== undefined) return cached;
    if (active.has(id)) return 0;
    const scene = scenesById.get(id);
    if (!scene) return 0;
    const nextActive = new Set(active).add(id);
    const rank = scene.dependsOn.length
      ? 1 + Math.max(...scene.dependsOn.map((dependency) => rankOf(dependency, nextActive)))
      : 0;
    sceneRanks.set(id, rank);
    return rank;
  };

  const moduleRanks = new Map<string, number>();
  for (const scene of story.scenes) {
    const rank = rankOf(scene.id);
    for (const moduleId of moduleIdsForActions(scene.actions, edges)) {
      const previous = moduleRanks.get(moduleId);
      if (previous === undefined || rank < previous) moduleRanks.set(moduleId, rank);
    }
  }
  const originalOrder = new Map(modules.map((module, index) => [module.id, index]));
  return modules
    .slice()
    .sort(
      (a, b) =>
        (moduleRanks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (moduleRanks.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0),
    );
}

type Box = { x: number; y: number; w: number; h: number };
const dist = (x: number, y: number, r: Box) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

async function place(modules: Module[], edges: Edge[], story: Story, grouped: boolean): Promise<Laid> {
  const ids = new Set(modules.map((m) => m.id));
  const narrated = storyEdgeIds(story);
  const real = edges.filter((e) => narrated.has(e.id) && ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const ordered = orderedByStory(modules, edges, story);

  const widest = real.reduce((n, e) => Math.max(n, labelWidth(e.label || e.kind)), 0);
  const layerGap = Math.max(120, Math.min(200, widest + 28));

  // Each group with two or more modules becomes a real ELK compound node, so the
  // group is a solid block and two groups can never overlap.
  const counts = new Map<string, number>();
  for (const m of modules) if (m.group) counts.set(m.group, (counts.get(m.group) ?? 0) + 1);
  const groupNodes = new Map<string, ElkNode>();
  if (grouped) {
    for (const [name, n] of counts) {
      if (n < 2) continue;
      groupNodes.set(name, {
        id: `group:${name}`,
        children: [],
        layoutOptions: { "elk.padding": "[top=48,left=28,bottom=28,right=28]" },
      });
    }
  }

  const children: ElkNode[] = [];
  const pushed = new Set<string>();
  for (const m of ordered) {
    const leaf: ElkNode = { id: m.id, ...size(m) };
    const g = groupNodes.get(m.group);
    if (g) {
      if (!pushed.has(g.id)) {
        pushed.add(g.id);
        children.push(g);
      }
      g.children!.push(leaf);
    } else {
      children.push(leaf);
    }
  }

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerGap),
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]",
      ...(groupNodes.size ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
    },
    children,
    edges: real.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const out = await elk.layout(root);

  // Absolute boxes, and where each edge ended up in the output tree.
  const abs = new Map<string, Box>();
  const parent = new Map<string, string | null>();
  const sections = new Map<string, { s: ElkEdgeSection; holder: string | null }>();
  const walk = (n: ElkNode, ox: number, oy: number, holder: string | null) => {
    for (const e of n.edges ?? []) {
      const s = e.sections?.[0];
      if (s) sections.set(e.id, { s, holder });
    }
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      abs.set(c.id, { x, y, w: c.width ?? 0, h: c.height ?? 0 });
      parent.set(c.id, holder);
      walk(c, x, y, c.id);
    }
  };
  walk(out, 0, 0, null);

  const origin = (id: string | null): { x: number; y: number } => (id ? abs.get(id) : undefined) ?? { x: 0, y: 0 };
  const lca = (a: string, b: string): string | null => {
    const chain = new Set<string>();
    for (let p = parent.get(a) ?? null; p; p = parent.get(p) ?? null) chain.add(p);
    for (let p = parent.get(b) ?? null; p; p = parent.get(p) ?? null) if (chain.has(p)) return p;
    return null;
  };

  const placed = modules.flatMap((m) => {
    const b = abs.get(m.id);
    return b ? [{ id: m.id, x: snap(b.x), y: snap(b.y), w: b.w || 176, h: b.h || 72, m }] : [];
  });
  const xs = [...new Set(placed.map((p) => p.x))].sort((a, b) => a - b);
  const nodes: PNode[] = placed.map((p) => ({ ...p, depth: xs.indexOf(p.x) }));

  const pe: PEdge[] = real.flatMap((e) => {
    const hit = sections.get(e.id);
    const src = abs.get(e.from);
    const dst = abs.get(e.to);
    if (!hit || !src || !dst) return [];
    const raw = [hit.s.startPoint, ...(hit.s.bendPoints ?? []), hit.s.endPoint];

    // ELK's edge coordinate frame depends on where it filed the edge. Try each
    // candidate and keep the one whose ends actually touch the two nodes.
    let pts = raw;
    let bestScore = Infinity;
    for (const o of [{ x: 0, y: 0 }, origin(hit.holder), origin(lca(e.from, e.to))]) {
      const shifted = raw.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
      const score =
        dist(shifted[0].x, shifted[0].y, src) + dist(shifted[shifted.length - 1].x, shifted[shifted.length - 1].y, dst);
      if (score < bestScore - 0.5) {
        bestScore = score;
        pts = shifted;
      }
    }
    if (grouped && bestScore > 24) throw new Error("compound edge routing did not line up");

    const snapped = pts.map((p): [number, number] => [snap(p.x), snap(p.y)]);
    let best = 0;
    let lx = snapped[0][0];
    let ly = snapped[0][1];
    let dir: [number, number] = [1, 0];
    for (let i = 1; i < snapped.length; i++) {
      const dx = snapped[i][0] - snapped[i - 1][0];
      const dy = snapped[i][1] - snapped[i - 1][1];
      const len = Math.abs(dx) + Math.abs(dy);
      if (len > best) {
        best = len;
        lx = (snapped[i][0] + snapped[i - 1][0]) / 2;
        ly = (snapped[i][1] + snapped[i - 1][1]) / 2;
        const mag = Math.hypot(dx, dy) || 1;
        dir = [dx / mag, dy / mag];
      }
    }
    return [{ e, pts: snapped, lx, ly, dir, d: snapped.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ") }];
  });
  if (grouped && groupNodes.size && pe.length < real.length) throw new Error("compound layout dropped edges");

  const nodeRects: Rect[] = nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const taken: Rect[] = [];
  for (const p of pe) placeLabel(p, nodeRects, taken);

  const groups: PGroup[] = groupNodes.size
    ? [...groupNodes].flatMap(([name, g]) => {
        const b = abs.get(g.id);
        return b ? [{ name, x: snap(b.x), y: snap(b.y), w: snap(b.w), h: snap(b.h) }] : [];
      })
    : [...new Set(modules.map((m) => m.group).filter(Boolean))].flatMap((name) => {
        const g = nodes.filter((n) => n.m.group === name);
        if (g.length < 2) return [];
        const x0 = Math.min(...g.map((n) => n.x)) - 24;
        const y0 = Math.min(...g.map((n) => n.y)) - 36;
        const x1 = Math.max(...g.map((n) => n.x + n.w)) + 24;
        const y1 = Math.max(...g.map((n) => n.y + n.h)) + 24;
        return [{ name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
      });

  return { w: snap(out.width ?? 800), h: snap(out.height ?? 440), nodes, edges: pe, groups };
}

export async function layout(modules: Module[], edges: Edge[], story: Story): Promise<Laid> {
  try {
    return await place(modules, edges, story, true);
  } catch {
    return place(modules, edges, story, false);
  }
}
