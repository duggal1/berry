import { memo, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionTemplate, useReducedMotion, useSpring } from "motion/react";
import type { MotionValue } from "motion/react";
import type { Edge, Module, Step } from "@/lib/schema";
import { EASE_QUINT, SCROLL_SPRING, SPRING } from "@/lib/motion";
import { INK, KIND, ROLE, STAGE_BG } from "./palette";
import { arrowPaths, cylinderPaths, polyPaths, queuePaths, rectPaths } from "./rough";
import type { RPath } from "./rough";
import { labelW, layout } from "./layout";
import type { Laid, PEdge, PGroup, PNode } from "./layout";

export type DiagramData = { modules: Module[]; edges: Edge[]; flow: Step[] };

const STAGGER = 0.07;
const DRAW = 0.48;
const PEN_T = 0.9;

function useDrawn(play: boolean, delay: number) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setDrawn(true), (delay + 0.6) * 1000);
    return () => clearTimeout(t);
  }, [play, delay]);
  return drawn;
}

const fit = (s: string, max: number) => (s.length > max ? `…${s.slice(s.length - max + 1)}` : s);

type Look = { emph: boolean; hover: boolean; dim: boolean; arrive: boolean };

const SketchNode = memo(function SketchNode(p: {
  n: PNode;
  play: boolean;
  delay: number;
  look: Look;
  reduce: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const { n, play, look, reduce } = p;
  const { m, w, h } = n;
  const color = ROLE[m.role];
  const paths = useMemo<RPath[]>(
    () =>
      m.kind === "datastore"
        ? cylinderPaths(m.id, w, h, color)
        : m.kind === "queue"
          ? queuePaths(m.id, w, h, color)
          : rectPaths(m.id, w, h, color),
    [m.id, m.kind, w, h, color],
  );
  const external = m.kind === "external";
  const datastore = m.kind === "datastore";
  const drawn = useDrawn(play, p.delay);
  const dly = reduce ? 0 : p.delay;
  const dur = reduce ? 0 : DRAW;
  const arrive = look.arrive && !reduce ? PEN_T - 0.15 : 0;
  const sw = look.hover || look.emph ? 2.25 : 1.5;
  const tint = look.emph ? 0.3 : look.hover ? 0.2 : 0.1;
  const hatch = look.emph ? 0.9 : look.hover ? 0.75 : 0.45;
  const ty = datastore ? 8 : 0;

  return (
    <g
      transform={`translate(${n.x} ${n.y})`}
      role="button"
      tabIndex={0}
      aria-label={`${m.name}. ${m.purpose}`}
      style={{ cursor: "pointer", outline: "none" }}
      onMouseEnter={p.onEnter}
      onMouseLeave={p.onLeave}
      onFocus={p.onEnter}
      onBlur={p.onLeave}
      onClick={(e) => {
        e.stopPropagation();
        p.onPick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          p.onPick();
        }
      }}
    >
      <rect width={w} height={h} fill="transparent" />
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: !play ? 0 : look.dim ? 0.28 : 1 }}
        transition={{ duration: drawn ? 0.2 : 0.01, delay: drawn ? 0 : dly }}
      >
        {!datastore && (
          <motion.rect
            width={w}
            height={h}
            fill={color}
            initial={{ opacity: 0 }}
            animate={{ opacity: play ? tint : 0 }}
            transition={{ duration: 0.3, delay: play ? (drawn ? arrive : dly + dur) : 0 }}
          />
        )}
        {paths.map((x, i) =>
          x.hatch ? (
            external ? null : (
              <motion.path
                key={i}
                d={x.d}
                fill="none"
                stroke={color}
                strokeWidth={0.9}
                initial={{ opacity: 0 }}
                animate={{ opacity: play ? hatch : 0 }}
                transition={{ duration: 0.3, delay: play ? (drawn ? arrive : dly + dur) : 0 }}
              />
            )
          ) : external ? (
            <motion.path
              key={i}
              d={x.d}
              fill="none"
              strokeDasharray="6 5"
              strokeLinecap="round"
              initial={{ stroke: INK, strokeWidth: sw }}
              animate={{ stroke: INK, strokeWidth: sw }}
              transition={SPRING.button}
            />
          ) : (
            <motion.path
              key={i}
              d={x.d}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, stroke: INK, strokeWidth: sw }}
              animate={{ pathLength: play ? 1 : 0, stroke: INK, strokeWidth: sw }}
              transition={{
                pathLength: { duration: dur, delay: dly, ease: EASE_QUINT },
                strokeWidth: SPRING.button,
              }}
            />
          ),
        )}
        <motion.g
          initial={{ opacity: 0, y: 4 }}
          animate={play ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: 0.18, delay: drawn ? 0 : dly + dur + 0.2 }}
        >
          <text
            x={20}
            y={30 + ty}
            fontSize={17}
            fontWeight={600}
            fill={INK}
            style={{ letterSpacing: "-0.02em" }}
          >
            {m.name}
          </text>
          <text x={20} y={52 + ty} className="font-mono" fontSize={11} fill="#6b6b6b">
            {fit(m.path, Math.floor((w - 40) / 6.9))}
          </text>
        </motion.g>
      </motion.g>
    </g>
  );
});

const SketchEdge = memo(function SketchEdge(p: {
  pe: PEdge;
  play: boolean;
  delay: number;
  lit: boolean;
  dim: boolean;
  current: boolean;
  stepKey: number;
  reduce: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { pe, play, lit, dim, current, reduce } = p;
  const col = KIND[pe.e.kind];
  const dashed = pe.e.inferred;
  const body = useMemo(() => polyPaths(pe.e.id, pe.pts), [pe]);
  const head = useMemo(
    () => arrowPaths(pe.e.id, pe.pts[pe.pts.length - 2], pe.pts[pe.pts.length - 1]),
    [pe],
  );
  const drawn = useDrawn(play, p.delay);
  const dly = reduce ? 0 : p.delay;
  const dur = reduce ? 0 : DRAW;

  return (
    <g>
      <path
        d={pe.d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: "pointer" }}
        onMouseEnter={p.onEnter}
        onMouseLeave={p.onLeave}
      />
      <motion.g
        style={{ pointerEvents: "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: !play ? 0 : dim ? 0.16 : 1 }}
        transition={{ duration: drawn ? 0.2 : 0.01, delay: drawn ? 0 : dly }}
      >
        {body.map((x, i) =>
          dashed ? (
            <path
              key={i}
              d={x.d}
              fill="none"
              stroke={col}
              strokeWidth={1.75}
              strokeDasharray="7 5"
              strokeLinecap="round"
            />
          ) : (
            <motion.path
              key={i}
              d={x.d}
              fill="none"
              stroke={col}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: play ? 1 : 0 }}
              transition={{ duration: dur, delay: dly, ease: EASE_QUINT }}
            />
          ),
        )}
        {head.map((x, i) => (
          <motion.path
            key={i}
            d={x.d}
            fill="none"
            stroke={col}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: play ? 1 : 0 }}
            transition={{ duration: 0.2, delay: dly + dur, ease: EASE_QUINT }}
          />
        ))}
        {lit &&
          body.map((x, i) => (
            <motion.path
              key={`${p.stepKey}-${i}`}
              d={x.d}
              fill="none"
              stroke={col}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "7 5" : undefined}
              initial={{ pathLength: current && !reduce && !dashed ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: PEN_T, ease: EASE_QUINT }}
            />
          ))}
      </motion.g>
    </g>
  );
});

function EdgeLabel({
  pe,
  play,
  delay,
  dim,
  lit,
  reduce,
}: {
  pe: PEdge;
  play: boolean;
  delay: number;
  dim: boolean;
  lit: boolean;
  reduce: boolean;
}) {
  const text = pe.e.label || pe.e.kind;
  const w = labelW(text);
  const drawn = useDrawn(play, delay);
  return (
    <motion.g
      style={{ pointerEvents: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: !play ? 0 : dim ? 0.16 : 1 }}
      transition={{ duration: 0.18, delay: drawn || reduce ? 0 : delay + DRAW }}
    >
      <rect x={pe.lx - w / 2} y={pe.ly - 10} width={w} height={20} fill={STAGE_BG} />
      <text
        x={pe.lx}
        y={pe.ly}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-mono"
        fontSize={11}
        fill={lit ? KIND[pe.e.kind] : "#6b6b6b"}
        fontWeight={lit ? 500 : 400}
      >
        {text}
      </text>
    </motion.g>
  );
}

function SketchGroup({ g, play, delay }: { g: PGroup; play: boolean; delay: number }) {
  const paths = useMemo(() => rectPaths(`g:${g.name}`, g.w, g.h, null), [g]);
  return (
    <g transform={`translate(${g.x} ${g.y})`} style={{ pointerEvents: "none" }}>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: play ? 1 : 0 }} transition={{ duration: 0.3, delay }}>
        {paths.map((x, i) => (
          <path
            key={i}
            d={x.d}
            fill="none"
            stroke={INK}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        ))}
        <text x={12} y={20} className="font-mono" fontSize={11} fill="#6b6b6b">
          {g.name}
        </text>
      </motion.g>
    </g>
  );
}

function Pen({ laid, cur, reduce }: { laid: Laid; cur: Step | undefined; reduce: boolean }) {
  const dot = useRef<SVGCircleElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const path = useRef<SVGPathElement>(null);
  const edge = cur?.edgeId ? laid.edges.find((e) => e.e.id === cur.edgeId) : undefined;
  const node = cur ? laid.nodes.find((n) => n.id === cur.moduleId) : undefined;
  const edgeId = edge?.e.id;
  const nodeId = node?.id;
  const curId = cur?.id;

  useEffect(() => {
    const c = dot.current;
    const r = ring.current;
    const p = path.current;
    if (!c || !r || !p) return;
    let dead = false;
    const place = (x: number, y: number) => {
      for (const el of [c, r]) {
        el.setAttribute("cx", String(x));
        el.setAttribute("cy", String(y));
        el.style.visibility = "visible";
      }
    };
    const hide = () => {
      for (const el of [c, r]) el.style.visibility = "hidden";
    };
    if (!curId || !node) {
      hide();
      return;
    }
    if (!edge) {
      place(node.x + 14, node.y + 14);
      return;
    }
    const len = p.getTotalLength();
    if (!len) {
      place(node.x + 14, node.y + 14);
      return;
    }
    if (reduce) {
      const e = p.getPointAtLength(len);
      place(e.x, e.y);
      return;
    }
    const ctl = animate(0, len, {
      duration: PEN_T,
      ease: EASE_QUINT,
      onUpdate: (v) => {
        // The path can be emptied or detached mid flight, when the trace moves on.
        if (dead || !p.isConnected) return;
        try {
          const pt = p.getPointAtLength(v);
          place(pt.x, pt.y);
        } catch {
          dead = true;
        }
      },
    });
    return () => {
      dead = true;
      ctl.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeId, nodeId, curId, reduce]);

  return (
    <g pointerEvents="none">
      <path ref={path} d={edge?.d ?? ""} fill="none" stroke="none" />
      <circle
        ref={ring}
        r={10}
        fill="none"
        stroke={node ? ROLE[node.m.role] : INK}
        strokeWidth={2.5}
        style={{ visibility: "hidden" }}
      />
      <circle ref={dot} r={4.5} fill={INK} style={{ visibility: "hidden" }} />
    </g>
  );
}

const go = (mv: MotionValue<number>, v: number, jump: boolean) => (jump ? mv.jump(v) : mv.set(v));

export function Diagram(props: {
  data: DiagramData;
  title: string;
  play: boolean;
  step: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data, play, step, selected, onSelect } = props;
  const reduce = useReducedMotion() ?? false;
  const [laid, setLaid] = useState<Laid | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    layout(data.modules, data.edges)
      .then((l) => {
        if (!live) return;
        setLaid(l);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [data.modules, data.edges]);

  const cur = step >= 0 ? data.flow[step] : undefined;
  const mode: "trace" | "focus" | "idle" = cur ? "trace" : hover || selected || hoverEdge ? "focus" : "idle";

  const lit = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (step >= 0)
      for (const s of data.flow.slice(0, step + 1)) {
        nodes.add(s.moduleId);
        if (s.edgeId) edges.add(s.edgeId);
      }
    return { nodes, edges };
  }, [data.flow, step]);

  const focus = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const f = hover ?? selected;
    if (f) {
      nodes.add(f);
      for (const e of data.edges)
        if (e.from === f || e.to === f) {
          nodes.add(e.from);
          nodes.add(e.to);
          if (!hoverEdge) edges.add(e.id);
        }
    }
    if (hoverEdge) {
      edges.add(hoverEdge);
      const e = data.edges.find((x) => x.id === hoverEdge);
      if (e) {
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
    return { nodes, edges };
  }, [hover, selected, hoverEdge, data.edges]);

  const x = useSpring(0, SCROLL_SPRING);
  const y = useSpring(0, SCROLL_SPRING);
  const s = useSpring(1, SCROLL_SPRING);
  const transform = useMotionTemplate`translate(${x}px, ${y}px) scale(${s})`;

  useEffect(() => {
    if (!laid) return;
    let tx = 0;
    let ty = 0;
    let ts = 1;
    if (cur) {
      const ids = new Set<string>([cur.moduleId]);
      const pe = laid.edges.find((e) => e.e.id === cur.edgeId);
      if (pe) {
        ids.add(pe.e.from);
        ids.add(pe.e.to);
      }
      const box = laid.nodes.filter((n) => ids.has(n.id));
      if (box.length) {
        const x0 = Math.min(...box.map((n) => n.x)) - 64;
        const x1 = Math.max(...box.map((n) => n.x + n.w)) + 64;
        const y0 = Math.min(...box.map((n) => n.y)) - 64;
        const y1 = Math.max(...box.map((n) => n.y + n.h)) + 64;
        ts = Math.min(1.45, Math.max(1, Math.min(laid.w / (x1 - x0), laid.h / (y1 - y0))));
        tx = laid.w / 2 - ((x0 + x1) / 2) * ts;
        ty = laid.h / 2 - ((y0 + y1) / 2) * ts;
      }
    }
    go(x, tx, reduce);
    go(y, ty, reduce);
    go(s, ts, reduce);
  }, [cur, laid, reduce, x, y, s]);

  const depth = useMemo(() => new Map((laid?.nodes ?? []).map((n) => [n.id, n.depth])), [laid]);
  const name = (id: string) => data.modules.find((m) => m.id === id)?.name ?? id;

  if (failed)
    return <p className="p-6 text-[15px] text-neutral-500">The sketch could not be laid out.</p>;
  if (!laid) return <div className="h-96" aria-busy />;

  const evId = hoverEdge ?? (mode === "trace" && cur?.edgeId ? cur.edgeId : null);
  const ev = evId ? data.edges.find((e) => e.id === evId) : undefined;

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${laid.w} ${laid.h}`}
          role="img"
          aria-label={props.title}
          className="block h-auto w-full min-w-[860px] select-none"
          onClick={() => onSelect(null)}
        >
          <title>{props.title}</title>
          <motion.g style={{ transform, transformOrigin: "0px 0px" }}>
            {laid.groups.map((g) => (
              <SketchGroup key={g.name} g={g} play={play} delay={0.1} />
            ))}
            {laid.edges.map((pe) => {
              const id = pe.e.id;
              const isLit = mode === "trace" ? lit.edges.has(id) : focus.edges.has(id);
              const isDim =
                mode === "trace"
                  ? !lit.edges.has(id)
                  : mode === "focus"
                    ? !focus.edges.has(id)
                    : false;
              const delay = Math.max(depth.get(pe.e.from) ?? 0, depth.get(pe.e.to) ?? 0) * STAGGER + 0.5;
              return (
                <SketchEdge
                  key={id}
                  pe={pe}
                  play={play}
                  delay={delay}
                  lit={isLit}
                  dim={isDim}
                  current={mode === "trace" && cur?.edgeId === id}
                  stepKey={step}
                  reduce={reduce}
                  onEnter={() => setHoverEdge(id)}
                  onLeave={() => setHoverEdge(null)}
                />
              );
            })}
            {laid.nodes.map((n) => (
              <SketchNode
                key={n.id}
                n={n}
                play={play}
                delay={n.depth * STAGGER}
                reduce={reduce}
                look={{
                  emph: mode === "trace" ? lit.nodes.has(n.id) : n.id === selected,
                  hover: mode !== "trace" && n.id === hover,
                  dim:
                    mode === "trace"
                      ? !lit.nodes.has(n.id)
                      : mode === "focus"
                        ? !focus.nodes.has(n.id)
                        : false,
                  arrive: mode === "trace" && cur?.moduleId === n.id,
                }}
                onEnter={() => setHover(n.id)}
                onLeave={() => setHover((h) => (h === n.id ? null : h))}
                onPick={() => onSelect(n.id === selected ? null : n.id)}
              />
            ))}
            {laid.edges.map((pe) => {
              const id = pe.e.id;
              const delay = Math.max(depth.get(pe.e.from) ?? 0, depth.get(pe.e.to) ?? 0) * STAGGER + 0.5;
              return (
                <EdgeLabel
                  key={id}
                  pe={pe}
                  play={play}
                  delay={delay}
                  reduce={reduce}
                  lit={mode === "trace" ? lit.edges.has(id) : focus.edges.has(id)}
                  dim={
                    mode === "trace" ? !lit.edges.has(id) : mode === "focus" ? !focus.edges.has(id) : false
                  }
                />
              );
            })}
            <Pen laid={laid} cur={cur} reduce={reduce} />
          </motion.g>
        </svg>
      </div>

      <ol className="sr-only">
        {laid.nodes.map((n) => (
          <li key={n.id}>
            {n.m.name}: {n.m.purpose}
          </li>
        ))}
        {data.edges.map((e) => (
          <li key={e.id}>
            {name(e.from)} {e.kind} {name(e.to)}: {e.label}
          </li>
        ))}
      </ol>

      {ev && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[24rem] bg-white px-4 py-3 text-[14px] leading-[1.45] md:left-4">
          <p className="font-semibold text-neutral-950">
            {name(ev.from)} → {name(ev.to)}
          </p>
          <p className="t-mono mt-1 text-neutral-500">
            {ev.inferred ? "inferred, backed by " : "found in "}
            <span className="text-neutral-950">{ev.evidence.path}</span>
          </p>
          <p className="t-mono mt-1 line-clamp-2 text-neutral-500">{ev.evidence.snippet}</p>
        </div>
      )}
    </div>
  );
}
