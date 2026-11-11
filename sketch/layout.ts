import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
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
  /** Unit vector along the longest segment, so a label can sit beside the wire, not on it. */
  dir: [number, number];
};
export type PGroup = { name: string; x: number; y: number; w: number; h: number };
export type Laid = { w: number; h: number; nodes: PNode[]; edges: PEdge[]; groups: PGroup[] };

const elk = new ELK();

/** The edge tag: mono 11px plus 16px of padding either side. */
export const LABEL_H = 22;
export const labelWidth = (s: string) => Math.ceil(s.length * 6.5) + 22;

type Rect = { x: number; y: number; w: number; h: number };

/** Signed gap between two boxes: positive means clear space, negative means overlap. */
function clearance(a: Rect, b: Rect) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (dx > 0 || dy > 0) return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return Math.max(dx, dy);
}

/**
 * Put the tag on the wire, at the point along it with the most room. Centring it on
 * the midpoint of the longest segment drops it straight onto a module box whenever a
 * wire hugs one, which is what makes the sketch look broken.
 */
function placeLabel(p: PEdge, nodes: Rect[], taken: Rect[]) {
  const w = labelWidth(p.e.label || p.e.kind);
  const h = LABEL_H;
  let bestScore = -Infinity;
  let bx = p.lx;
  let by = p.ly;
  let bestGap = -Infinity;

  const consider = (x: number, y: number) => {
    const rect = { x: x - w / 2, y: y - h / 2, w, h };
    let gap = 999;
    for (const n of nodes) gap = Math.min(gap, clearance(rect, n));
    for (const l of taken) gap = Math.min(gap, clearance(rect, l));
    // Prefer the visual middle, but only after clearance: a clear spot 80px away
    // beats a tag sitting on a border.
    const score = Math.min(gap, 48) - Math.hypot(x - p.lx, y - p.ly) * 0.06;
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
    // Keep the tag clear of the node ports and of the arrowhead.
    const from = Math.min(18, len / 4);
    const to = len - Math.min(20, len / 4);
    for (let d = from; d <= to; d += 5) {
      const t = d / len;
      consider(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  p.lx = bx;
  p.ly = by;
  if (bestGap > 2) taken.push({ x: bx - w / 2, y: by - h / 2, w, h });
}

function size(m: Module) {
  const base =
    Math.max(m.name.length * 9.6, m.path.length * 7) + 40 + (m.kind === "queue" ? 36 : 0) + (m.tech || m.domain ? 26 : 0);
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

/** Keep the main story spine and sibling branch scenes in model order for ELK. */
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
  return modules.slice().sort((a, b) =>
    (moduleRanks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (moduleRanks.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
    (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0),
  );
}

export async function layout(modules: Module[], edges: Edge[], story: Story): Promise<Laid> {
  const ids = new Set(modules.map((m) => m.id));
  const real = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const storyOrderedModules = orderedByStory(modules, edges, story);

  // A tag sits on the wire between two layers, so the layers have to be at least as
  // far apart as the widest tag. Otherwise the badge is forced to spill onto a box.
  const widest = real.reduce((n, e) => Math.max(n, labelWidth(e.label || e.kind)), 0);
  const layerGap = Math.max(112, Math.min(200, widest + 28));

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerGap),
      "elk.layered.spacing.edgeNodeBetweenLayers": "32",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]",
    },
    children: storyOrderedModules.map((m) => ({ id: m.id, ...size(m) })),
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
    let dir: [number, number] = [1, 0];
    for (let i = 1; i < pts.length; i++) {
      const len =
        Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      if (len > best) {
        best = len;
        lx = (pts[i][0] + pts[i - 1][0]) / 2;
        ly = (pts[i][1] + pts[i - 1][1]) / 2;
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const mag = Math.hypot(dx, dy) || 1;
        dir = [dx / mag, dy / mag];
      }
    }
    return [
      {
        e,
        pts,
        lx,
        ly,
        dir,
        d: pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "),
      },
    ];
  });

  // Place the tags last, so each one can see the boxes and the tags already placed.
  const nodeRects: Rect[] = nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const taken: Rect[] = [];
  for (const p of pe) placeLabel(p, nodeRects, taken);

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
