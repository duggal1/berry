import { memo, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import type { Edge, Module, Step } from "@/lib/schema";
import { EASE_QUINT, SPRING } from "@/lib/motion";
import { ArrowIcon } from "@/components/ui";
import { logoUrl } from "@/lib/logos";
import { INK, KIND, ROLE, STAGE_BG } from "./palette";
import { cylinderPaths, queuePaths, rectPaths } from "./rough";
import type { RPath } from "./rough";
import { layout, labelWidth, LABEL_H } from "./layout";
import type { Laid, PEdge, PGroup, PNode } from "./layout";

export type DiagramData = { modules: Module[]; edges: Edge[]; flow: Step[] };

const STAGGER = 0.07;
const DRAW = 0.48;
const PEN_T = 0.9;

const HEAD_L = 11;
const HEAD_W = 11;

/** A crisp orthogonal wire with a solid, sharp triangular head. */
function wire(pts: [number, number][]) {
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const seg = Math.hypot(dx, dy) || 1;
  const ux = dx / seg;
  const uy = dy / seg;
  const L = Math.min(HEAD_L, seg * 0.8);
  const bx = b[0] - ux * L;
  const by = b[1] - uy * L;
  const h = HEAD_W / 2;
  const body = [...pts.slice(0, -1), [bx, by]]
    .map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`)
    .join(" ");
  const head = `${b[0]},${b[1]} ${bx - uy * h},${by + ux * h} ${bx + uy * h},${by - ux * h}`;
  return { body, head };
}

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
  const logo = logoUrl(m.tech);
  const [hasLogo, setHasLogo] = useState(false);
  useEffect(() => {
    if (!logo) {
      setHasLogo(false);
      return;
    }
    let live = true;
    const img = new Image();
    img.onload = () => live && setHasLogo(true);
    img.onerror = () => live && setHasLogo(false);
    img.src = logo;
    return () => {
      live = false;
    };
  }, [logo]);
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
          {hasLogo && logo && (
            <image
              href={logo}
              x={19}
              y={16 + ty}
              width={17}
              height={17}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          <text
            x={hasLogo ? 44 : 20}
            y={30 + ty}
            fontSize={17}
            fontWeight={650}
            fill={INK}
            className="svg-text"
            style={{ letterSpacing: "-0.03em" }}
          >
            {m.name}
          </text>
          <text x={20} y={52 + ty} className="svg-mono" fontSize={12} fill="#404040">
            {fit(m.path, Math.floor((w - 40) / 7.2))}
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
  const { body, head } = useMemo(() => wire(pe.pts), [pe.pts]);
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
        {dashed ? (
          <path
            d={body}
            fill="none"
            stroke={col}
            strokeWidth={2}
            strokeDasharray="7 5"
            strokeLinejoin="miter"
          />
        ) : (
          <motion.path
            d={body}
            fill="none"
            stroke={col}
            strokeWidth={2}
            strokeLinejoin="miter"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: play ? 1 : 0 }}
            transition={{ duration: dur, delay: dly, ease: EASE_QUINT }}
          />
        )}
        <motion.polygon
          points={head}
          fill={col}
          stroke={col}
          strokeLinejoin="miter"
          initial={{ opacity: 0, strokeWidth: 0 }}
          animate={{ opacity: play ? 1 : 0, strokeWidth: lit ? 1.5 : 0 }}
          transition={{ opacity: { duration: 0.12, delay: dly + dur }, strokeWidth: SPRING.button }}
        />
        {lit && (
          <motion.path
            key={p.stepKey}
            d={body}
            fill="none"
            stroke={col}
            strokeWidth={3.5}
            strokeLinejoin="miter"
            strokeDasharray={dashed ? "7 5" : undefined}
            initial={{ pathLength: current && !reduce && !dashed ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: PEN_T, ease: EASE_QUINT }}
          />
        )}
      </motion.g>
    </g>
  );
});

function EdgeLabel({
  pe,
  play,
  delay,
  dim,
  reduce,
}: {
  pe: PEdge;
  play: boolean;
  delay: number;
  dim: boolean;
  reduce: boolean;
}) {
  const text = pe.e.label || pe.e.kind;
  const w = labelWidth(text);
  const h = LABEL_H;
  // Positioned by the layout: on the wire, but slid along it to the roomiest point.
  const x = pe.lx - w / 2;
  const y = pe.ly - h / 2;
  const drawn = useDrawn(play, delay);
  return (
    <motion.g
      style={{ pointerEvents: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: !play ? 0 : 1 }}
      transition={{ duration: 0.18, delay: drawn || reduce ? 0 : delay + DRAW }}
    >
      {/* Opaque, always. A see-through tag lets the wire run through the letters. */}
      <rect x={x} y={y} width={w} height={h} fill={dim ? "#e5e5e5" : INK} />
      <text
        x={pe.lx}
        y={pe.ly + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        className="svg-mono"
        fontSize={11}
        fill={dim ? "#737373" : "#fff"}
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
  const mark = useRef<SVGGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const edge = cur?.edgeId ? laid.edges.find((e) => e.e.id === cur.edgeId) : undefined;
  const node = cur ? laid.nodes.find((n) => n.id === cur.moduleId) : undefined;
  const edgeId = edge?.e.id;
  const nodeId = node?.id;

  useEffect(() => {
    const g = mark.current;
    const p = path.current;
    if (!g || !node) return;
    let dead = false;
    const place = (x: number, y: number) => {
      g.setAttribute("transform", `translate(${x} ${y})`);
      g.style.visibility = "visible";
    };
    if (!edge || !p) {
      place(node.x + 14, node.y + 14);
      return;
    }
    // Rests just behind the arrowhead, at the far end of the wire, clear of the label.
    const end = Math.max(0, p.getTotalLength() - HEAD_L - 4);
    if (reduce) {
      const e = p.getPointAtLength(end);
      place(e.x, e.y);
      return;
    }
    const ctl = animate(0, end, {
      duration: PEN_T,
      ease: EASE_QUINT,
      onUpdate: (v) => {
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
  }, [edgeId, nodeId, reduce]);

  if (!cur || !node) return null;
  return (
    <g pointerEvents="none">
      <path ref={path} d={edge?.d ?? ""} fill="none" stroke="none" />
      <g ref={mark} style={{ visibility: "hidden" }}>
        <circle r={8.5} fill={STAGE_BG} />
        <circle r={5.5} fill={INK} />
        <circle r={2} fill={ROLE[node.m.role]} />
      </g>
    </g>
  );
}

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

  // While the page is scrolling the cursor sweeps across modules and wires, firing
  // enter/leave pairs that flip every other element between lit and dim. That reads as
  // flicker. Scroll wins: drop the hover state and ignore new hovers until it settles.
  const scrolling = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      scrolling.current = true;
      setHover(null);
      setHoverEdge(null);
      clearTimeout(t);
      t = setTimeout(() => (scrolling.current = false), 160);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, []);
  const enter = (id: string) => {
    if (!scrolling.current) setHover(id);
  };
  const enterEdge = (id: string) => {
    if (!scrolling.current) setHoverEdge(id);
  };

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

  // No camera. The sketch stays whole: a zoom or a pan clips modules and stacks the
  // labels on top of each other. The trace is told by the lit path, not by the camera.
  const depth = useMemo(() => new Map((laid?.nodes ?? []).map((n) => [n.id, n.depth])), [laid]);
  const name = (id: string) => data.modules.find((m) => m.id === id)?.name ?? id;

  if (failed)
    return <p className="p-6 text-[15px] text-neutral-500">The sketch could not be laid out.</p>;
  if (!laid) return <div className="h-96" aria-busy />;

  const evId = hoverEdge ?? (mode === "trace" && cur?.edgeId ? cur.edgeId : null);
  const ev = evId ? data.edges.find((e) => e.id === evId) : undefined;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${laid.w} ${laid.h}`}
          role="img"
          aria-label={props.title}
          className="block h-auto w-full min-w-[860px] select-none"
          onClick={() => onSelect(null)}
        >
          <motion.g style={{ transformOrigin: "0px 0px" }}>
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
                  onEnter={() => enterEdge(id)}
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
                onEnter={() => enter(n.id)}
                onLeave={() => setHover((h) => (h === n.id ? null : h))}
                onPick={() => onSelect(n.id === selected ? null : n.id)}
              />
            ))}
            {/* The pen runs under the labels, so a tag never covers the travelling dot. */}
            <Pen laid={laid} cur={cur} reduce={reduce} />
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
                  dim={
                    mode === "trace" ? !lit.edges.has(id) : mode === "focus" ? !focus.edges.has(id) : false
                  }
                />
              );
            })}
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
        <div className="mt-3 inline-flex max-w-[46rem] flex-wrap items-start gap-x-6 gap-y-2 bg-neutral-950 px-5 py-4 text-white antialiased">
          <div className="flex min-w-0 items-center gap-2.5 text-[16px] font-semibold tracking-[-0.025em]">
            <span
              className="size-2.5 shrink-0"
              style={{ background: ev.kind === "call" ? "#fff" : KIND[ev.kind] }}
            />
            <span className="truncate">{name(ev.from)}</span>
            <ArrowIcon size={15} />
            <span className="truncate">{name(ev.to)}</span>
          </div>
          <p className="t-mono min-w-0 flex-1 text-[12px] text-neutral-400">
            {ev.inferred ? "inferred · backed by " : "found in "}
            <span className="text-white">{ev.evidence.path}</span>
          </p>
          <p className="t-mono w-full text-[12px] leading-[1.55] text-neutral-300">
            {ev.evidence.snippet}
          </p>
        </div>
      )}
    </div>
  );
}
