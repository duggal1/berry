# Saved-analysis architecture canvas and playback source

Source files are listed in render and playback order. The landing page is excluded.

## `components/Workspace.tsx`

```tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { shareAnalysis } from "@/lib/api";
import { useTrace } from "@/lib/hooks";
import { EASE_QUINT } from "@/lib/motion";
import { normalizeModulePresentations } from "@/lib/module-presentation";
import { prefs } from "@/lib/prefs";
import { GENERATOR_VERSION, STORY_SCHEMA_VERSION, type Analysis } from "@/lib/schema";
import { ROLE } from "@/sketch/palette";
import { polyPaths } from "@/sketch/rough";
import { AskPane, FlowPane, InterviewPane, PromptPane, SummaryPane } from "./Panels";
import { ModuleDetail } from "./ModuleDetail";
import { Stage } from "./Stage";
import { Button, Chip } from "./ui";

type Tab = "summary" | "path" | "prompt" | "interview" | "ask";
const TABS: { id: Tab; label: string; color: string }[] = [
  { id: "summary", label: "Summary", color: ROLE.core },
  { id: "path", label: "Path", color: ROLE.entry },
  { id: "prompt", label: "Prompt", color: ROLE.data },
  { id: "interview", label: "Interview", color: ROLE.utility },
  { id: "ask", label: "Ask", color: ROLE.integration },
];

function Underline({ id, color }: { id: string; color: string }) {
  const reduce = useReducedMotion() ?? false;
  const paths = useMemo(() => polyPaths(`ul:${id}`, [[0, 4], [80, 4]]), [id]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 8"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -bottom-1 left-0 h-2 w-full"
    >
      {paths.map((p, i) => (
        <motion.path
          key={i}
          d={p.d}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.48, ease: EASE_QUINT }}
        />
      ))}
    </svg>
  );
}

function ShareButton({ analysis }: { analysis: Analysis }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function share() {
    setState("busy");
    try {
      const id = await shareAnalysis(analysis);
      const link = `${location.origin}${location.pathname}#/s/${id}`;
      await navigator.clipboard.writeText(link);
      prefs.addShare({ id, repo: analysis.meta.repo, at: Date.now() });
      setMsg("Anyone with the link can read this analysis.");
      setState("done");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create the link.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={share} disabled={state === "busy"}>
        {state === "busy" ? "Uploading" : state === "done" ? "Link copied" : "Share link"}
      </Button>
      {msg && <span className="text-[15px] text-neutral-500">{msg}</span>}
    </div>
  );
}

export function Workspace({
  analysis,
  running = false,
  demo = false,
  below = false,
  onSaveCopy,
  onReanalyze,
}: {
  analysis: Analysis;
  running?: boolean;
  demo?: boolean;
  below?: boolean;
  onSaveCopy?: () => void;
  onReanalyze?: () => void;
}) {
  const trace = useTrace(analysis.story);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const stageRef = useRef<HTMLDivElement>(null);
  const modules = useMemo(() => normalizeModulePresentations(analysis.modules), [analysis.modules]);
  const displayAnalysis = useMemo(() => ({ ...analysis, modules }), [analysis, modules]);
  const data = useMemo(
    () => ({ modules, edges: analysis.edges, story: analysis.story }),
    [modules, analysis.edges, analysis.story],
  );
  const picked = modules.find((m) => m.id === selected);
  const toStage = () => stageRef.current?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight") trace.next();
      else if (e.key === "ArrowLeft") trace.prev();
      else if (e.key === "Escape") {
        trace.clear();
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="w-full pb-28">
      <header
        className={`mx-auto max-w-[1680px] px-5 md:px-10 ${below ? "pt-10" : "pt-32 md:pt-36"}`}
      >
        <h1 className="t-h1 max-w-[18ch]">{analysis.meta.title}</h1>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Chip i={0}>{analysis.meta.repo}</Chip>
          <Chip i={1}>{analysis.meta.sha.slice(0, 7)}</Chip>
          <Chip i={2}>{analysis.modules.length} modules</Chip>
          {demo && <Chip i={3}>example</Chip>}
          {(analysis.meta.storyVersion < STORY_SCHEMA_VERSION || analysis.meta.generatorVersion !== GENERATOR_VERSION) && (
            <Chip i={4}>older storyboard</Chip>
          )}
        </div>
        {!demo && !onSaveCopy && !running && (
          <div className="mt-6">
            <ShareButton analysis={analysis} />
          </div>
        )}
        {onSaveCopy && (
          <div className="mt-6">
            <Button onClick={onSaveCopy}>Save to this browser</Button>
          </div>
        )}
        {onReanalyze && (
          <div className="mt-6">
            <Button onClick={onReanalyze}>Generate updated storyboard</Button>
          </div>
        )}
      </header>

      <div ref={stageRef} className="mt-10 scroll-mt-16">
        <Stage
          data={data}
          title={`Architecture of ${analysis.meta.repo}`}
          trace={trace}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <div className="mx-auto mt-14 max-w-5xl px-5 md:px-10">
        {picked && <ModuleDetail m={picked} analysis={displayAnalysis} onClose={() => setSelected(null)} />}

        <div role="tablist" className="flex snap-x snap-proximity gap-8 overflow-x-auto overscroll-x-contain pb-3 md:snap-none">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={`t-h3 relative shrink-0 snap-start pb-3 transition-colors duration-100 ${
                  on ? "text-neutral-950" : "text-neutral-300 hover:text-neutral-500"
                }`}
              >
                {t.label}
                {on && <Underline key={t.id} id={t.id} color={t.color} />}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="pt-10">
          {tab === "summary" && (
            <SummaryPane
              analysis={displayAnalysis}
              onPick={(id) => {
                setSelected(id);
                toStage();
              }}
            />
          )}
          {tab === "path" && (
            <FlowPane
              story={analysis.story}
              step={trace.step}
              go={(i) => {
                trace.go(i);
                toStage();
              }}
            />
          )}
          {tab === "prompt" && <PromptPane analysis={displayAnalysis} running={running} />}
          {tab === "interview" && <InterviewPane analysis={displayAnalysis} />}
          {tab === "ask" && <AskPane analysis={displayAnalysis} demo={demo} />}
        </div>
      </div>
    </main>
  );
}

```

## `components/Stage.tsx`

```tsx

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SPEEDS, useInViewOnce } from "@/lib/hooks";
import { EASE_QUINT } from "@/lib/motion";
import type { Trace } from "@/lib/hooks";
import type { Edge, Story } from "@/lib/schema";
import { Diagram } from "@/sketch/Diagram";
import type { DiagramData } from "@/sketch/Diagram";
import { INK, KIND, ROLE } from "@/sketch/palette";
import { storyEdgeIds } from "@/sketch/layout";
import { ChevronIcon, IconButton, PauseIcon, PlayIcon, Segmented } from "./ui";

function DotField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: "radial-gradient(rgba(0,0,0,.14) 0.6px, transparent 0.7px)",
        backgroundSize: "16px 16px",
      }}
    />
  );
}

function TraceBar({ trace, story, edges }: { trace: Trace; story: Story; edges: Edge[] }) {
  const scenes = story.scenes;
  const cur = trace.step >= 0 ? scenes[trace.step] : undefined;
  const parents = cur?.dependsOn.flatMap((id) => {
    const parent = scenes.find((scene) => scene.id === id);
    return parent ? [parent.title] : [];
  }) ?? [];
  const inferred = cur?.actions.flatMap((action) => {
    if (action.kind !== "traverse" && action.kind !== "return" && action.kind !== "spawn") return [];
    const edge = edges.find((item) => item.id === action.edgeId);
    return edge?.inferred ? [edge] : [];
  }) ?? [];
  const fork = cur?.actions.find((action) => action.kind === "fork");
  const canPlay = scenes.length > 0;
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="relative mx-auto flex max-w-[1680px] flex-col gap-4 px-5 pb-6 pt-2 md:flex-row md:items-center md:gap-6 md:px-10">
      <div className="flex shrink-0 gap-2">
        <IconButton label="Previous scene" onClick={trace.prev} disabled={trace.step < 0}>
          <ChevronIcon dir="left" />
        </IconButton>
        <IconButton
          label={trace.playing ? "Pause" : "Play explanation"}
          onClick={trace.toggle}
          disabled={!canPlay}
        >
          {trace.playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton label="Restart explanation" onClick={trace.restart} disabled={!canPlay}>
          <span aria-hidden="true" className="text-[18px] leading-none">↻</span>
        </IconButton>
        <IconButton label="Next scene" onClick={trace.next} disabled={trace.step >= scenes.length - 1}>
          <ChevronIcon dir="right" />
        </IconButton>
      </div>
      <Segmented
        id="story-speed"
        value={String(trace.speed)}
        onChange={(value) => trace.setSpeed(Number(value))}
        options={SPEEDS.map((value) => ({ id: String(value), label: `${value}×` }))}
      />
      <p className="shrink-0 text-[13px] tabular-nums text-neutral-500">
        {trace.step >= 0 ? `${trace.step + 1} / ${scenes.length}` : `${scenes.length} scenes`}
      </p>
      <div aria-live="polite" className="min-h-[3.75rem] min-w-0 flex-1">
        <AnimatePresence initial={false}>
        {cur ? (
          <motion.div
            key={cur.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_QUINT }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[22px] font-semibold leading-[1.1] tracking-tight md:text-[28px]">{cur.title}</p>
              {cur.branchMode === "exclusive" && <span className="t-mono text-[11px] text-neutral-500">alternative outcome</span>}
              {cur.branchMode === "independent" && <span className="t-mono text-[11px] text-neutral-500">independent consequence</span>}
              {cur.kind === "deferred" && <span className="t-mono text-[11px] text-neutral-500">after response</span>}
              {fork && <span className="t-mono text-[11px] text-neutral-500">{fork.mode === "exclusive" ? "conditional alternatives" : "independent branches"}</span>}
              {cur.unverified && <span className="t-mono text-[11px] text-neutral-500">unverified transition</span>}
            </div>
            <p className="mt-1 text-[16px] leading-[1.45] text-neutral-600">{cur.caption}</p>
            {parents.length > 0 && (
              <p className="mt-1 text-[13px] text-neutral-500">Triggered by {parents.join(" and ")}</p>
            )}
            {inferred.length > 0 && (
              <p className="mt-1 text-[13px] text-neutral-500">
                Inferred relationship · the cited source suggests this runtime link, but static analysis cannot confirm its target.
              </p>
            )}
            {cur.evidence.map((item) => (
              <details key={`${item.path}:${item.snippet}`} className="mt-2 text-[12px] text-neutral-500">
                <summary className="cursor-pointer">Source · {item.path}</summary>
                <code className="mt-1 block whitespace-pre-wrap font-mono text-[12px] leading-[1.5] text-neutral-700">
                  {item.snippet}
                </code>
              </details>
            ))}
            {trace.step === scenes.length - 1 && (
              <p className="mt-2 text-[13px] text-neutral-600">{story.completion.summary}</p>
            )}
          </motion.div>
        ) : (
          <motion.p
            key="idle"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_QUINT }}
            className="text-[18px] leading-[1.4] text-neutral-600 md:text-[20px]"
          >
            {canPlay
              ? "Play follows the verified scenes and their independent consequences."
              : "No verified story scenes are available for this repository."}
          </motion.p>
        )}
        </AnimatePresence>
        {story.completion.status !== "success" && (
          <p className="mt-1 text-[13px] text-neutral-500">Partial explanation · {story.completion.summary}</p>
        )}
      </div>
    </div>
  );
}

function Legend({ data }: { data: DiagramData }) {
  const roles = useMemo(() => [...new Set(data.modules.map((m) => m.role))], [data.modules]);
  const kinds = useMemo(() => {
    const ids = storyEdgeIds(data.story);
    return [...new Set(data.edges.filter((edge) => ids.has(edge.id)).map((edge) => edge.kind))];
  }, [data.edges, data.story]);
  return (
    <ul className="relative mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-7 gap-y-2.5 px-5 pb-8 text-neutral-600 md:px-10">
      {roles.map((r) => (
        <li key={r} className="flex items-center gap-2 text-[13px] font-medium tracking-[0.02em]">
          <span className="size-2.5" style={{ background: ROLE[r] }} />
          {r}
        </li>
      ))}
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-2 text-[13px] font-medium tracking-[0.02em]">
          <svg width="26" height="8" aria-hidden>
            <line x1="1" y1="4" x2="25" y2="4" stroke={KIND[k]} strokeWidth="2" />
          </svg>
          {k}
        </li>
      ))}
      <li className="flex items-center gap-2 text-[13px] font-medium tracking-[0.02em]">
        <svg width="26" height="8" aria-hidden>
          <line x1="1" y1="4" x2="25" y2="4" stroke={INK} strokeWidth="2" strokeDasharray="6 4" />
        </svg>
        inferred
      </li>
    </ul>
  );
}

export function Stage(props: {
  data: DiagramData;
  title: string;
  trace: Trace;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [ref, seen] = useInViewOnce<HTMLElement>("-5% 0px");
  return (
    <section ref={ref} className="relative w-full bg-neutral-100">
      <DotField />
      <div className="relative mx-auto max-w-[1680px] px-5 pt-6 md:px-10 md:pt-10">
        <div className="mb-3 flex items-center justify-between">
          <span className="t-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            architecture
          </span>

        </div>
        <Diagram
          data={props.data}
          title={props.title}
          play={seen}
          step={props.trace.step}
          progress={props.trace.progress}
          focusResetKey={props.trace.cameraResetKey}
          selected={props.selected}
          onSelect={props.onSelect}
          height="min(68vh, 720px)"
          toolbar={null}
        />
      </div>
      <TraceBar trace={props.trace} story={props.data.story} edges={props.data.edges} />
      <Legend data={props.data} />
    </section>
  );
}

```

## `sketch/Diagram.tsx`

```tsx

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import type { Edge, Module, Story, StoryAction } from "@/lib/schema";
import { EASE_QUINT, SPRING } from "@/lib/motion";
import { ArrowIcon } from "@/components/ui";
import { Canvas } from "@/components/Canvas";
import type { FocusRegion } from "@/components/Canvas";
import { logoUrl } from "@/lib/logos";
import { INK, KIND, ROLE, STAGE_BG } from "./palette";
import {
  cylinderPaths,
  documentPaths,
  entryPaths,
  integrationPaths,
  queuePaths,
  rectPaths,
  utilityPaths,
} from "./rough";
import type { RPath } from "./rough";
import { clipLabel, layout, labelWidth, LABEL_H } from "./layout";
import type { Laid, PEdge, PGroup, PNode } from "./layout";

export type DiagramData = { modules: Module[]; edges: Edge[]; story: Story };

const STAGGER = 0.07;
const DRAW = 0.48;
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

function modulesForActions(actions: StoryAction[], edges: Edge[]): Set<string> {
  const modules = new Set<string>();
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  for (const action of actions) {
    switch (action.kind) {
      case "enter":
      case "exit":
      case "effect":
        modules.add(action.moduleId);
        break;
      case "spawn":
        modules.add(action.moduleId);
        {
          const edge = edgeById.get(action.edgeId);
          if (edge) modules.add(edge.to);
        }
        break;
      case "traverse": {
        const edge = edgeById.get(action.edgeId);
        if (edge) {
          modules.add(edge.from);
          modules.add(edge.to);
        }
        break;
      }
      case "return": {
        const edge = edgeById.get(action.edgeId);
        if (edge) {
          modules.add(edge.from);
          modules.add(edge.to);
        }
        break;
      }
      case "fork":
      case "join":
      case "outcome":
        break;
    }
  }
  return modules;
}

function pathLength(points: [number, number][]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

function pathMotionRange(points: [number, number][]) {
  const total = pathLength(points);
  const first = points[0] ?? [0, 0];
  if (points.length < 2 || total === 0) {
    return { progress: [0, 1], x: [first[0], first[0]], y: [first[1], first[1]] };
  }

  const progress = [0];
  const x = [first[0]];
  const y = [first[1]];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const segment = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (segment === 0) continue;
    travelled += segment;
    progress.push(travelled / total);
    x.push(current[0]);
    y.push(current[1]);
  }
  return { progress, x, y };
}

function edgeIdsForActions(actions: StoryAction[]): string[] {
  return actions.flatMap((action) => {
    if (action.kind === "traverse" || action.kind === "return" || action.kind === "spawn") return [action.edgeId];
    return [];
  });
}

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
          : m.kind === "external" || m.role === "integration"
            ? integrationPaths(m.id, w, h, color)
            : m.role === "entry"
              ? entryPaths(m.id, w, h, color)
              : m.role === "utility"
                ? utilityPaths(m.id, w, h, color)
                : m.role === "data"
                  ? documentPaths(m.id, w, h, color)
                  : rectPaths(m.id, w, h, color),
    [m.id, m.kind, m.role, w, h, color],
  );
  const external = m.kind === "external";
  const datastore = m.kind === "datastore";
  const logo = logoUrl(m.tech, m.domain);
  const [loadedLogo, setLoadedLogo] = useState<string | null>(null);
  const hasLogo = Boolean(logo && loadedLogo === logo);
  useEffect(() => {
    if (!logo) return;
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setLoadedLogo(logo); };
    img.onerror = () => { if (live) setLoadedLogo(null); };
    img.src = logo;
    return () => { live = false; };
  }, [logo]);
  const drawn = useDrawn(play, p.delay);
  const dly = reduce ? 0 : p.delay;
  const dur = reduce ? 0 : DRAW;
  const arrive = look.arrive && !reduce ? 0.2 : 0;
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
  progress: MotionValue<number>;
  reduce: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { pe, play, lit, dim, current, progress, reduce } = p;
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
          <TraceStroke
            key={p.stepKey}
            d={body}
            color={col}
            dashed={dashed}
            current={current}
            progress={progress}
            reduce={reduce}
          />
        )}
      </motion.g>
    </g>
  );
});

function TraceStroke({
  d,
  color,
  dashed,
  current,
  progress,
  reduce,
}: {
  d: string;
  color: string;
  dashed: boolean;
  current: boolean;
  progress: MotionValue<number>;
  reduce: boolean;
}) {
  const offset = useTransform(progress, [0, 1], dashed ? [0, -12] : [1, 0]);
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={3.5}
      strokeLinejoin="miter"
      pathLength={1}
      strokeDasharray={dashed ? "7 5" : "1"}
      style={{ strokeDashoffset: current && !reduce ? offset : 0 }}
    />
  );
}

function EdgeLabel({
  pe,
  play,
  delay,
  dim,
  reduce,
  visible,
}: {
  pe: PEdge;
  play: boolean;
  delay: number;
  dim: boolean;
  reduce: boolean;
  visible: boolean;
}) {
  const raw = pe.e.label || pe.e.kind;
  const text = clipLabel(raw);
  const w = labelWidth(raw);
  const h = LABEL_H;
  // Positioned by the layout: on the wire, but slid along it to the roomiest point.
  const x = pe.lx - w / 2;
  const y = pe.ly - h / 2;
  const drawn = useDrawn(play, delay);
  return (
    <motion.g
      style={{ pointerEvents: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: !play || !visible ? 0 : 1 }}
      transition={{ duration: reduce ? 0 : 0.22, delay: drawn || reduce ? 0 : delay + DRAW, ease: EASE_QUINT }}
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


function PenDot({
  edge,
  role,
  progress,
  reduce,
}: {
  edge: PEdge;
  role: Module["role"];
  progress: MotionValue<number>;
  reduce: boolean;
}) {
  const range = useMemo(() => pathMotionRange(edge.pts), [edge.pts]);
  const x = useTransform(progress, range.progress, range.x);
  const y = useTransform(progress, range.progress, range.y);

  if (reduce) {
    const [endX, endY] = edge.pts[edge.pts.length - 1] ?? [0, 0];
    return (
      <g transform={`translate(${endX} ${endY})`}>
        <circle r={8.5} fill={STAGE_BG} />
        <circle r={5.5} fill={INK} />
        <circle r={2} fill={ROLE[role]} />
      </g>
    );
  }

  return (
    <motion.g style={{ x, y }}>
      <circle r={8.5} fill={STAGE_BG} />
      <circle r={5.5} fill={INK} />
      <circle r={2} fill={ROLE[role]} />
    </motion.g>
  );
}

function Pen({
  laid,
  edges,
  progress,
  reduce,
  stepKey,
}: {
  laid: Laid;
  edges: PEdge[];
  progress: MotionValue<number>;
  reduce: boolean;
  stepKey: number;
}) {
  if (!edges.length) return null;
  return (
    <g pointerEvents="none">
      {edges.map((edge) => {
        const end = laid.nodes.find((node) => node.id === edge.e.to);
        if (!end) return null;
        return (
          <PenDot
            key={`${edge.e.id}:${stepKey}`}
            edge={edge}
            role={end.m.role}
            progress={progress}
            reduce={reduce}
          />
        );
      })}
    </g>
  );
}

export function Diagram(props: {
  data: DiagramData;
  title: string;
  play: boolean;
  step: number;
  progress: MotionValue<number>;
  focusResetKey: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  height?: string;
  zoomOnWheel?: boolean;
  toolbar?: ReactNode;
}) {
  const { data, play, step, progress, selected, onSelect } = props;
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
    layout(data.modules, data.edges, data.story)
      .then((l) => {
        if (!live) return;
        setLaid(l);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [data.modules, data.edges, data.story]);

  const cur = step >= 0 ? data.story.scenes[step] : undefined;
  const reached = useTransform(progress, (value) => value >= 1);
  const [arrived, setArrived] = useState(progress.get() >= 1);
  useEffect(() => reached.on("change", setArrived), [reached]);

  const mode: "trace" | "focus" | "idle" = cur ? "trace" : hover || selected || hoverEdge ? "focus" : "idle";

  const lit = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (step >= 0) {
      for (const scene of data.story.scenes.slice(0, step + 1)) {
        for (const id of modulesForActions(scene.actions, data.edges)) nodes.add(id);
        for (const action of scene.actions) {
          if (action.kind === "traverse" || action.kind === "return" || action.kind === "spawn") edges.add(action.edgeId);
        }
    }
    }
    return { nodes, edges };
  }, [data.edges, data.story.scenes, step]);

  const currentEdgeIds = useMemo(() => {
    if (!cur) return new Set<string>();
    return new Set(edgeIdsForActions(cur.actions));
  }, [cur]);
  const currentPenEdges = useMemo(
    () => laid?.edges.filter((edge) => currentEdgeIds.has(edge.e.id)) ?? [],
    [currentEdgeIds, laid],
  );
  const currentModuleIds = useMemo(
    () => cur ? modulesForActions(cur.actions, data.edges) : new Set<string>(),
    [cur, data.edges],
  );
  const displayedEdges = useMemo(() => laid?.edges.map((edge) => edge.e) ?? [], [laid]);
  const focusRegion = useMemo<FocusRegion | null>(() => {
    if (step < 0 || !laid) return null;
    const active = laid.nodes.filter((node) => currentModuleIds.has(node.id));
    if (active.length === 0) return { x: 0, y: 0, w: laid.w, h: laid.h };
    const x = Math.min(...active.map((node) => node.x));
    const y = Math.min(...active.map((node) => node.y));
    const right = Math.max(...active.map((node) => node.x + node.w));
    const bottom = Math.max(...active.map((node) => node.y + node.h));
    return { x, y, w: right - x, h: bottom - y };
  }, [currentModuleIds, laid, step]);

  const focus = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<string>();
    const f = hover ?? selected;
    if (f) {
      nodes.add(f);
      for (const e of displayedEdges)
        if (e.from === f || e.to === f) {
          nodes.add(e.from);
          nodes.add(e.to);
          if (!hoverEdge) edges.add(e.id);
        }
    }
    if (hoverEdge) {
      edges.add(hoverEdge);
      const e = displayedEdges.find((x) => x.id === hoverEdge);
      if (e) {
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
    return { nodes, edges };
  }, [hover, selected, hoverEdge, displayedEdges]);

  const depth = useMemo(() => new Map((laid?.nodes ?? []).map((n) => [n.id, n.depth])), [laid]);
  const name = (id: string) => data.modules.find((m) => m.id === id)?.name ?? id;

  if (failed)
    return <p className="p-6 text-[15px] text-neutral-500">The sketch could not be laid out.</p>;
  if (!laid) return <div className="h-96" aria-busy />;

  const evId = hoverEdge ?? (mode === "trace" ? currentEdgeIds.values().next().value ?? null : null);
  const ev = evId ? data.edges.find((e) => e.id === evId) : undefined;

  return (
    <div>
      <Canvas
        w={laid.w}
        h={laid.h}
        title={props.title}
        focusRegion={focusRegion}
        focusKey={step}
        focusResetKey={props.focusResetKey}
        reducedMotion={reduce}
        height={props.height}
        zoomOnWheel={props.zoomOnWheel}
        toolbar={props.toolbar}
        onBackgroundClick={() => onSelect(null)}
      >
        <motion.g style={{ transformOrigin: "0px 0px" }}>
          {laid.groups.map((group) => (
            <SketchGroup key={group.name} g={group} play={play} delay={0.4} />
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
                  current={mode === "trace" && currentEdgeIds.has(id)}
                  stepKey={step}
                  progress={progress}
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
                  arrive: mode === "trace" && currentModuleIds.has(n.id) && arrived,
                }}
                onEnter={() => enter(n.id)}
                onLeave={() => setHover((h) => (h === n.id ? null : h))}
                onPick={() => onSelect(n.id === selected ? null : n.id)}
              />
            ))}
            {/* The pen runs under the labels, so a tag never covers the travelling dot. */}
            <Pen laid={laid} edges={currentPenEdges} progress={progress} reduce={reduce} stepKey={step} />
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
                  visible={hoverEdge === id || (mode === "trace" ? currentEdgeIds.has(id) : mode === "focus" && focus.edges.has(id))}
                />
              );
            })}
          </motion.g>
      </Canvas>

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

```

## `components/Canvas.tsx`

```tsx

"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, ReactNode } from "react";
import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";

const MIN_K = 0.04;
const MAX_K = 16;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export type FocusRegion = { x: number; y: number; w: number; h: number };

/**
 * A real canvas: the sketch keeps its natural size and the viewport pans, zooms and
 * fits. A large architecture opens zoomed out, whole, and readable from there instead
 * of being blown up past the edges of the page.
 */
export function Canvas({
  w,
  h,
  title,
  focusRegion,
  focusKey = 0,
  focusResetKey = 0,
  reducedMotion = false,
  height = "min(62vh, 640px)",
  zoomOnWheel = false,
  toolbar,
  onBackgroundClick,
  children,
}: {
  w: number;
  h: number;
  title: string;
  focusRegion?: FocusRegion | null;
  focusKey?: number;
  focusResetKey?: number;
  reducedMotion?: boolean;
  height?: string;
  zoomOnWheel?: boolean;
  toolbar?: ReactNode;
  onBackgroundClick?: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const touched = useRef(false);
  const lastFocusReset = useRef(focusResetKey);
  const panFrame = useRef(0);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [grabbing, setGrabbing] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [focusResumeKey, setFocusResumeKey] = useState(0);

  const fit = useCallback((showAll = false) => {
    const el = box.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    setAutoFocus(false);
    const fullScale = clampK(Math.min(cw / w, ch / h) * 0.97);
    // At phone widths, a full-graph fit can reduce text to unreadable pixels.
    // Start at a readable scale; the existing percent control still fits all.
    const k = !showAll && cw < 640 ? Math.max(fullScale, 0.55) : fullScale;
    setView({
      x: Math.max(16, (cw - w * k) / 2),
      y: Math.max(16, (ch - h * k) / 2),
      k,
    });
  }, [w, h]);

  // Fit whenever a new sketch arrives (or the window changes shape) until the person
  // takes over the view.
  useLayoutEffect(() => {
    touched.current = false;
    const el = box.current;
    if (el) setViewport({ width: el.clientWidth, height: el.clientHeight });
    fit();
  }, [fit]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport((current) => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        return current.width === next.width && current.height === next.height ? current : next;
      });
      if (!touched.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    if (lastFocusReset.current !== focusResetKey) {
      lastFocusReset.current = focusResetKey;
      touched.current = false;
    }
    if (!focusRegion || touched.current) return;
    const el = box.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    const padding = 72;
    const region = {
      x: Math.max(0, focusRegion.x - padding),
      y: Math.max(0, focusRegion.y - padding),
      w: Math.min(w, focusRegion.w + padding * 2),
      h: Math.min(h, focusRegion.h + padding * 2),
    };
    const overview = Math.min(el.clientWidth / w, el.clientHeight / h) * 0.97;
    const cap = Math.min(1.1, Math.max(overview * 2.2, 0.6));
    const framed = Math.min(el.clientWidth / region.w, el.clientHeight / region.h) * 0.9;
    const k = clampK(Math.max(overview, Math.min(framed, cap)));
    setView({
      x: el.clientWidth / 2 - (region.x + region.w / 2) * k,
      y: el.clientHeight / 2 - (region.y + region.h / 2) * k,
      k,
    });
    setAutoFocus(true);
  }, [focusKey, focusRegion, focusResetKey, focusResumeKey, h, w, viewport.width, viewport.height]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!zoomOnWheel && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      touched.current = true;
      setAutoFocus(false);
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0016));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomOnWheel]);

  useEffect(() => () => {
    if (panFrame.current) cancelAnimationFrame(panFrame.current);
  }, []);

  const zoomBy = (f: number) => {
    const el = box.current;
    if (!el) return;
    touched.current = true;
    setAutoFocus(false);
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const k = clampK(v.k * f);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  function down(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("g[role='button'], [data-canvas-ui]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.x, oy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGrabbing(true);
  }

  // Pointer events can arrive faster than the display refreshes. Apply at most
  // one compositor transform per animation frame instead of rerendering per event.
  function queuePan(x: number, y: number) {
    pendingPan.current = { x, y };
    if (panFrame.current) return;
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = 0;
      const next = pendingPan.current;
      pendingPan.current = null;
      if (next) setView((v) => ({ ...v, ...next }));
    });
  }

  function move(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) {
      touched.current = true;
      setAutoFocus(false);
      queuePan(d.ox + dx, d.oy + dy);
    }
  }

  function up(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (panFrame.current) cancelAnimationFrame(panFrame.current);
    panFrame.current = 0;
    const last = pendingPan.current;
    pendingPan.current = null;
    if (last) setView((v) => ({ ...v, ...last }));
    setGrabbing(false);
    if (!d.moved && e.type !== "pointercancel") onBackgroundClick?.();
  }

  return (
    <div
      ref={box}
      role="application"
      aria-label={`${title}. Drag to pan, zoom with the controls.`}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=") zoomBy(1.2);
        else if (e.key === "-") zoomBy(1 / 1.2);
        else if (e.key === "0") {
          touched.current = false;
          setFocusResumeKey((key) => key + 1);
          fit(true);
        }
      }}
      className="relative w-full touch-pan-y select-none overflow-hidden outline-none md:touch-none"
      style={{ height, cursor: grabbing ? "grabbing" : "grab" }}
    >
      <motion.div
        className="absolute left-0 top-0"
        style={{
          width: w,
          height: h,
          transformOrigin: "0 0",
        }}
        animate={{ x: view.x, y: view.y, scale: view.k }}
        transition={autoFocus && !reducedMotion ? SPRING.camera : { duration: 0 }}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={title}
          className="block select-none"
        >
          {children}
        </svg>
      </motion.div>

      {toolbar && (
        <div data-canvas-ui className="absolute left-4 top-4 z-10 md:left-6 md:top-5">
          {toolbar}
        </div>
      )}

      <div
        data-canvas-ui
        className="absolute bottom-4 right-4 z-10 flex items-center gap-0.5 bg-white/90 px-1 py-1 backdrop-blur-[2px] md:bottom-5 md:right-6"
      >
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
          className="grid size-11 place-items-center text-[19px] md:size-8 leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            touched.current = false;
            setFocusResumeKey((key) => key + 1);
            setAutoFocus(false);
            fit(true);
          }}
          className="min-w-11 px-1 text-center text-[12px] font-medium tabular-nums text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Fit the whole sketch"
        >
          {Math.round(view.k * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.2)}
          className="grid size-11 place-items-center text-[19px] md:size-8 leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          +
        </button>
      </div>
    </div>
  );
}

```

## `components/ui.tsx`

```tsx

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { SPRING } from "@/lib/motion";
import { INK, PALETTE, ROLE } from "@/sketch/palette";

export const wipe = (c: string) => ({ "--wipe": c }) as CSSProperties;

export function Chip({
  children,
  i = 0,
  color,
}: {
  children: ReactNode;
  i?: number;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-2 text-[14px] font-medium leading-none text-neutral-800">
      <span className="size-2" style={{ background: color ?? PALETTE[i % PALETTE.length] }} />
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "solid" | "quiet";
  accent?: string;
};

const ROLL = "transition-transform duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]";

export function Button({ tone = "solid", accent, className = "", children, ...rest }: BtnProps) {
  const solid = tone === "solid";
  return (
    <button
      type="button"
      style={wipe(accent ?? (solid ? ROLE.core : INK))}
      className={`btn group inline-flex h-11 shrink-0 items-center justify-center px-5 text-[16px] font-medium tracking-[-0.02em] disabled:pointer-events-none disabled:opacity-40 ${
        solid ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-950"
      } ${className}`}
      {...rest}
    >
      <span className="relative block overflow-hidden">
        <span
          className={`flex items-center gap-2 ${ROLL} group-hover:-translate-y-full group-focus-visible:-translate-y-full`}
        >
          {children}
        </span>
        <span
          aria-hidden
          className={`absolute inset-0 flex translate-y-full items-center gap-2 text-white ${ROLL} group-hover:translate-y-0 group-focus-visible:translate-y-0`}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

export function IconButton({
  label,
  dark = true,
  className = "",
  ...rest
}: HTMLMotionProps<"button"> & { label: string; dark?: boolean }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileHover={reduce ? undefined : { scale: 1.035 }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={SPRING.icon}
      style={wipe(dark ? ROLE.core : INK)}
      className={`btn grid size-11 shrink-0 place-items-center disabled:pointer-events-none disabled:opacity-30 ${
        dark
          ? "bg-neutral-950 text-white"
          : "bg-neutral-100 text-neutral-950 transition-colors delay-100 duration-200 hover:text-white"
      } ${className}`}
      {...rest}
    />
  );
}

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.25,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
} as const;

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 4v16l13-8z" fill="currentColor" stroke="none" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...base}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
export const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg {...base}>
    <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden
    className={`shrink-0 ${className}`}
  >
    <path d="M1.5 8h12.5M9 3.5 13.5 8 9 12.5" />
  </svg>
);

export const StopIcon = () => (
  <svg {...base}>
    <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />
  </svg>
);

export function Pulse({ label, tone }: { label: string; tone?: string }) {
  const reduce = useReducedMotion() ?? false;
  const colors = tone ? [tone] : [ROLE.entry, ROLE.core, ROLE.data];
  return (
    <p className="flex items-center gap-3 text-[15px] leading-none text-neutral-950" aria-live="polite">
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {colors.map((c, i) => (
          <motion.span
            key={c}
            className="size-2"
            style={{ background: c }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.28, 1, 0.28] }}
            transition={reduce ? { duration: 0 } : {
              duration: 1.6,
              repeat: Infinity,
              delay: i * 0.18,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
    </p>
  );
}

export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div role="radiogroup" className="relative inline-flex h-11 items-center bg-neutral-100 p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative h-9 px-4 text-[15px] font-medium tracking-[-0.02em] transition-colors duration-200 ${
              on ? "text-white" : "text-neutral-500 hover:text-neutral-950"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 bg-neutral-950"
                transition={reduce ? { duration: 0 } : SPRING.slide}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

```

## `lib/hooks.ts`

```ts

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { animate, useMotionValue } from "motion/react";
import { analyzeRepo } from "./api";
import { saveAnalysis } from "./store";
import type { Analysis, AnalysisCore, Stage, Story, StoryScene, TraceItem } from "./schema";

export type Route =
  | { name: "home" }
  | { name: "example" }
  | { name: "run"; url: string; preserveExisting: boolean }
  | { name: "local"; id: string }
  | { name: "shared"; id: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const a = parts[0] ?? "";
  const rawArg = parts[1] ?? "";
  let arg = "";
  try {
    arg = rawArg ? decodeURIComponent(rawArg) : "";
  } catch {
    arg = "";
  }
  if (a === "example") return { name: "example" };
  if (a === "run" && rawArg) {
    const split = rawArg.indexOf("?");
    const routeArg = split < 0 ? rawArg : rawArg.slice(0, split);
    const query = split < 0 ? "" : rawArg.slice(split + 1);
    let url = "";
    try {
      url = decodeURIComponent(routeArg);
    } catch {
      return { name: "home" };
    }
    return { name: "run", url, preserveExisting: new URLSearchParams(query).get("save") === "new" };
  }
  if (a === "r" && arg) return { name: "local", id: arg };
  if (a === "s" && arg) return { name: "shared", id: arg };
  return { name: "home" };
}

let current = typeof location === "undefined" ? "" : location.hash;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    current = location.hash;
    listeners.forEach((l) => l());
  });
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function useRoute(): Route {
  const h = useSyncExternalStore(
    subscribe,
    () => current,
    () => "",
  );
  return useMemo(() => parse(h), [h]);
}

export function useInViewOnce<T extends Element>(margin = "-10% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

export const SPEEDS = [1, 1.5, 2, 3] as const;

function sceneTiming(scene: StoryScene | undefined) {
  if (!scene) return { travel: 0, total: 0 };
  const moves = scene.actions.some((action) => action.kind === "traverse" || action.kind === "return" || action.kind === "spawn");
  const words = `${scene.title} ${scene.caption}`.trim().split(/\s+/).filter(Boolean).length;
  const read = Math.min(2800, Math.max(1000, 600 + words * 60));
  const travel = moves ? 750 : 0;
  return { travel, total: Math.max(read, travel + 350) };
}

export function useTrace(story: Story) {
  const scenes = story.scenes;
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<number>(1.5);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const progress = useMotionValue(0);
  const run = useRef(0);
  const animator = useRef<ReturnType<typeof animate> | null>(null);
  const playSceneRef = useRef<(index: number, chain: boolean, durationOverride?: number) => void>(() => undefined);
  const startedAt = useRef(0);
  const durationMs = useRef(0);
  const remainingMs = useRef(0);
  const speedRef = useRef(speed);
  const stepRef = useRef(step);
  const playingRef = useRef(playing);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const stop = useCallback(() => {
    run.current += 1;
    animator.current?.stop();
    animator.current = null;
  }, []);

  const playScene = useCallback((index: number, chain: boolean, durationOverride?: number) => {
    stop();
    const token = run.current;
    const scene = scenes[index];
    setStep(index);
    stepRef.current = index;
    if (!scene) { setPlaying(false); playingRef.current = false; return; }
    const fullDuration = sceneTiming(scene).total / speedRef.current;
    const duration = durationOverride ?? fullDuration;
    durationMs.current = fullDuration;
    remainingMs.current = duration;
    startedAt.current = performance.now();
    animator.current = animate(progress, 1, {
      duration: duration / 1000,
      ease: "linear",
      onComplete: () => {
        if (run.current !== token || !chain) return;
        if (index >= scenes.length - 1) {
          setPlaying(false);
          playingRef.current = false;
          return;
        }
        progress.jump(0);
        playSceneRef.current(index + 1, true);
      },
    });
  }, [progress, scenes, stop]);
  useEffect(() => { playSceneRef.current = playScene; }, [playScene]);

  useEffect(() => {
    stop();
    // A new storyboard invalidates the previous scene index.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(-1);
    setPlaying(false);
    stepRef.current = -1;
    playingRef.current = false;
    progress.jump(0);
    remainingMs.current = 0;
  }, [story, stop, progress]);
  useEffect(() => () => stop(), [stop]);

  const go = useCallback((index: number) => {
    setPlaying(false);
    playingRef.current = false;
    stop();
    const next = Math.max(-1, Math.min(scenes.length - 1, index));
    setStep(next);
    stepRef.current = next;
    progress.jump(next < 0 ? 0 : 1);
    remainingMs.current = 0;
    if (next < 0) setCameraResetKey((key) => key + 1);
  }, [progress, scenes.length, stop]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      const elapsed = Math.max(0, performance.now() - startedAt.current);
      remainingMs.current = Math.max(0, remainingMs.current - elapsed);
      stop();
      setPlaying(false);
      playingRef.current = false;
      return;
    }
    if (!scenes.length) return;
    const current = stepRef.current;
    const index = current < 0 || current >= scenes.length - 1 ? 0 : current;
    if (current < 0 || current >= scenes.length - 1) {
      progress.jump(0);
      remainingMs.current = 0;
      setCameraResetKey((key) => key + 1);
    }
    const resume = current === index && remainingMs.current > 0 && progress.get() > 0;
    const duration = resume ? remainingMs.current : undefined;
    if (!resume) progress.jump(0);
    setPlaying(true);
    playingRef.current = true;
    playScene(index, true, duration);
  }, [playScene, progress, scenes.length, stop]);

  const setSpeed = useCallback((next: number) => {
    if (!SPEEDS.some((value) => value === next)) return;
    setSpeedState(next);
    if (!playingRef.current) return;
    const elapsed = Math.max(0, performance.now() - startedAt.current);
    remainingMs.current = Math.max(0, remainingMs.current - elapsed);
    const current = stepRef.current;
    stop();
    playScene(current, true, remainingMs.current * speedRef.current / next);
  }, [playScene, stop]);

  return {
    step, playing, progress, speed, setSpeed, cameraResetKey,
    travelSec: sceneTiming(scenes[step]).travel / 1000 / speed,
    go,
    next: () => go(step + 1),
    prev: () => go(step - 1),
    clear: () => go(-1),
    restart: () => {
      progress.jump(0);
      remainingMs.current = 0;
      setCameraResetKey((key) => key + 1);
      setPlaying(true);
      playingRef.current = true;
      playScene(0, true);
    },
    toggle,
  };
}

export type Trace = ReturnType<typeof useTrace>;

/** Upsert one trace row. `text` is a delta, `label` replaces, `done` closes it. */
function mergeTrace(list: TraceItem[], ev: TraceItem): TraceItem[] {
  const i = list.findIndex((x) => x.id === ev.id);
  if (i < 0) return [...list, ev];
  const prev = list[i];
  const c = list.slice();
  c[i] = {
    ...prev,
    label: ev.label || prev.label,
    text: prev.text + ev.text,
    done: ev.done || prev.done,
  };
  return c;
}

export function useAnalysisRun(url: string, token: string | null, preserveExisting = false) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [core, setCore] = useState<AnalysisCore | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    let latest: AnalysisCore | null = null;
    let initialSave: Promise<void> | null = null;
    let text = "";
    let queue: TraceItem[] = [];
    let frame = 0;

    const flush = () => {
      frame = 0;
      const batch = queue;
      queue = [];
      if (batch.length) setTrace((t) => batch.reduce(mergeTrace, t));
      setPrompt(text);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };

    (async () => {
      try {
        for await (const ev of analyzeRepo(url, token, ac.signal)) {
          if (ev.type === "stage")
            setStages((s) => [...s.filter((x) => x.id !== ev.stage.id), ev.stage]);
          else if (ev.type === "trace") {
            queue.push(ev.item);
            schedule();
          } else if (ev.type === "analysis") {
            latest = ev.analysis;
            setCore(ev.analysis);
            // Persist immediately so a refresh or a closed tab never loses the sketch.
            initialSave = (async () => {
              try {
                const rec = await saveAnalysis(
                  { ...ev.analysis, codingPrompt: text },
                  { preserveExisting },
                );
                history.replaceState(null, "", `#/r/${rec.id}`);
              } catch {
                /* keep running; the final save will retry */
              }
            })();
          } else if (ev.type === "prompt") {
            text += ev.text;
            schedule();
          } else if (latest) {
            cancelAnimationFrame(frame);
            flush();
            // The early save may still be pending. Serialize both writes so
            // an empty prompt can never overwrite the completed one.
            if (initialSave) await initialSave;
            const rec = await saveAnalysis(
              { ...latest, codingPrompt: text },
              { preserveExisting },
            );
            history.replaceState(null, "", `#/r/${rec.id}`);
            setStatus("done");
          }
        }
        if (!latest) throw new Error("The server finished without a result.");
        setStatus((s) => (s === "running" ? "done" : s));
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e instanceof Error ? e.message : "The run failed.");
          setStatus("error");
        }
      }
    })();
    return () => {
      ac.abort();
      cancelAnimationFrame(frame);
    };
  }, [preserveExisting, url, token]);

  const analysis = useMemo<Analysis | null>(
    () => (core ? { ...core, codingPrompt: prompt } : null),
    [core, prompt],
  );
  return { stages, trace, analysis, status, error };
}

```

## `lib/timeline.ts`

```ts

export type TimelineState = {
  sceneIndex: number;
  playing: boolean;
  elapsedMs: number;
  progress: number;
  startedAt: number | null;
};

export type TimelineAction =
  | { type: "play"; sceneCount: number; now: number }
  | { type: "pause"; now: number; durationMs: number }
  | { type: "tick"; sceneCount: number; durationMs: number; now: number }
  | { type: "seek"; sceneCount: number; sceneIndex: number }
  | { type: "restart"; sceneCount: number; now: number }
  | { type: "clear" };

export const INITIAL_TIMELINE: TimelineState = {
  sceneIndex: -1,
  playing: false,
  elapsedMs: 0,
  progress: 0,
  startedAt: null,
};

function atScene(sceneIndex: number, playing = false, now: number | null = null): TimelineState {
  return { sceneIndex, playing, elapsedMs: 0, progress: 0, startedAt: now };
}

export function reduceTimeline(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case "play": {
      if (state.playing || action.sceneCount === 0) return state;
      if (state.sceneIndex < 0 || state.sceneIndex >= action.sceneCount - 1) {
        return atScene(0, true, action.now);
      }
      return { ...state, playing: true, startedAt: action.now };
    }
    case "pause": {
      if (!state.playing) return state;
      const elapsedMs = state.elapsedMs + Math.max(0, action.now - (state.startedAt ?? action.now));
      const progress = action.durationMs > 0 ? Math.min(1, elapsedMs / action.durationMs) : state.progress;
      return { ...state, playing: false, elapsedMs, progress, startedAt: null };
    }
    case "tick": {
      if (!state.playing || state.sceneIndex < 0 || action.durationMs <= 0) return state;
      const elapsedMs = state.elapsedMs + Math.max(0, action.now - (state.startedAt ?? action.now));
      const progress = Math.min(1, elapsedMs / action.durationMs);
      if (progress >= 1) {
        if (state.sceneIndex >= action.sceneCount - 1) {
          return { ...state, playing: false, elapsedMs: action.durationMs, progress: 1, startedAt: null };
        }
        return atScene(state.sceneIndex + 1, true, action.now);
      }
      if (Math.abs(progress - state.progress) < 0.015) return state;
      return { ...state, elapsedMs: state.elapsedMs, progress };
    }
    case "seek": {
      const sceneIndex = Math.max(-1, Math.min(action.sceneCount - 1, action.sceneIndex));
      return atScene(sceneIndex);
    }
    case "restart":
      return action.sceneCount > 0 ? atScene(0, true, action.now) : INITIAL_TIMELINE;
    case "clear":
      return INITIAL_TIMELINE;
  }
}

```

## `lib/motion.ts`

```ts

export const EASE_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_STD: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const SCROLL_SPRING = { stiffness: 80, damping: 24, mass: 0.6, restDelta: 0.0002 };

export const SPRING = {
  button: { type: "spring" as const, stiffness: 110, damping: 24, mass: 1.3 },
  camera: {
    type: "spring" as const,
    stiffness: 250,
    damping: 30,
    mass: 0.75,
    restDelta: 0.2,
    restSpeed: 0.2,
  },
  trace: {
    type: "spring" as const,
    stiffness: 700,
    damping: 58,
    mass: 0.2,
    restDelta: 0.0005,
    restSpeed: 0.005,
  },
  faqHeight: {
    type: "spring" as const,
    stiffness: 88,
    damping: 20.5,
    mass: 1.15,
    restDelta: 0.4,
    restSpeed: 0.4,
  },
  faqY: { type: "spring" as const, stiffness: 120, damping: 22, mass: 1, delay: 0.05 },
  icon: { type: "spring" as const, stiffness: 260, damping: 34, mass: 1 },
  row: { type: "spring" as const, stiffness: 140, damping: 24, mass: 0.9 },
  bar: { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.8 },
  slide: { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 },
};

```

## `lib/module-presentation.ts`

```ts

import type { Module } from "./schema";

const DATABASE_TECHNOLOGIES: [RegExp, string][] = [
  [/\bpostgres(?:ql)?\b/i, "PostgreSQL"],
  [/\bmysql\b/i, "MySQL"],
  [/\bsqlite\b/i, "SQLite"],
  [/\b(?:mongo\s?db|mongodb)\b/i, "MongoDB"],
  [/\bdynamodb\b/i, "DynamoDB"],
  [/\bredis\b/i, "Redis"],
  [/\bneon\b/i, "Neon"],
];

const LANGUAGE_TAG = /^(?:typescript|javascript|tsx?|jsx?|python|ruby|go|rust|java|kotlin|swift|c#|c\+\+|php)$/i;

function databaseTechnology(module: Module): string {
  const source = `${module.name} ${module.purpose} ${module.tech ?? ""}`;
  return DATABASE_TECHNOLOGIES.find(([pattern]) => pattern.test(source))?.[1] ?? "";
}

function moduleKind(module: Module): Module["kind"] {
  if (module.kind === "external" || module.kind === "queue" || module.kind === "datastore") {
    return module.kind;
  }

  const name = module.name.toLowerCase();
  const pathParts = module.path.toLowerCase().split("/").filter(Boolean);
  const databasePath = pathParts.some((part) => ["db", "database", "databases", "persistence"].includes(part));
  const databaseName = /\b(?:database|datastore|postgres(?:ql)?|mysql|sqlite|mongodb|dynamodb)\b/i.test(name);
  const databasePurpose = /\b(?:database|postgres(?:ql)?|mysql|sqlite|mongodb|dynamodb)\b/i.test(module.purpose);
  if (databaseName || (databasePath && databasePurpose)) return "datastore";

  if (/\b(?:message\s+)?queue\b/i.test(name)) return "queue";
  return module.kind;
}

function moduleRole(module: Module, kind: Module["kind"]): Module["role"] {
  if (kind === "datastore" || kind === "queue") return "data";
  if (kind === "external") return "integration";

  const identity = `${module.name} ${module.path}`.toLowerCase();
  const text = `${identity} ${module.purpose}`;
  if (/\b(config|configuration|settings|environment|feature flags?)\b/.test(text)) return "config";
  if (/\b(redux slice|state store|repository|repositories|cache|schema)\b/.test(identity)) return "data";
  if (/\b(auth|authentication|middleware|validator|validation|logger|logging|helper|utilities)\b/.test(text)) return "utility";
  if (/\b(api client|provider|sdk|gateway|payment|integration|external service|llm)\b/.test(text)) return "integration";
  if (/\b(page|tab|route|routes|router|endpoint|entry point|http handler|command line)\b/.test(text)) return "entry";
  if (/\b(controller|agent|worker|processor|orchestrator|thunk|service|business logic)\b/.test(text)) return "core";
  return module.role;
}

/** Repair presentation metadata that model output often collapses to one role. */
export function normalizeModulePresentation(module: Module): Module {
  const kind = moduleKind(module);
  const inferredDatabaseTech = kind === "datastore" ? databaseTechnology(module) : "";
  const tech = inferredDatabaseTech || (LANGUAGE_TAG.test(module.tech?.trim() ?? "") ? "" : module.tech?.trim() ?? "");
  return {
    ...module,
    role: moduleRole(module, kind),
    kind,
    tech: tech || undefined,
  };
}

export function normalizeModulePresentations(modules: Module[]): Module[] {
  return modules.map(normalizeModulePresentation);
}

```

## `sketch/layout.ts`

```ts

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
  /** Unit vector along the longest segment, so a label can sit beside the wire, not on it. */
  dir: [number, number];
};
export type PGroup = { name: string; x: number; y: number; w: number; h: number };
export type Laid = { w: number; h: number; nodes: PNode[]; edges: PEdge[]; groups: PGroup[] };

const elk = new ELK();

/** The edge tag: mono 11px plus 16px of padding either side. */
export const LABEL_H = 22;
export const clipLabel = (s: string, max = 28) => s.length > max ? `${s.slice(0, max - 1)}…` : s;
export const labelWidth = (s: string) => Math.ceil(clipLabel(s).length * 6.5) + 22;

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
  const side = h / 2 + 6;
  let bestScore = -Infinity;
  let bx = p.lx;
  let by = p.ly;
  let bestGap = -Infinity;

  const consider = (x: number, y: number, off: number) => {
    const rect = { x: x - w / 2, y: y - h / 2, w, h };
    let gap = 999;
    for (const n of nodes) gap = Math.min(gap, clearance(rect, n));
    for (const l of taken) gap = Math.min(gap, clearance(rect, l));
    // Prefer the visual middle, but only after clearance: a clear spot 80px away
    // beats a tag sitting on a border.
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
    // Keep the tag clear of the node ports and of the arrowhead.
    const from = Math.min(18, len / 4);
    const to = len - Math.min(20, len / 4);
    for (let d = from; d <= to; d += 5) {
      const t = d / len;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
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

async function place(modules: Module[], edges: Edge[], story: Story, grouped: boolean): Promise<Laid> {
  const ids = new Set(modules.map((m) => m.id));
  const narratedEdges = storyEdgeIds(story);
  const real = edges.filter((e) => narratedEdges.has(e.id) && ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const storyOrderedModules = orderedByStory(modules, edges, story);

  // A tag sits on the wire between two layers, so the layers have to be at least as
  // far apart as the widest tag. Otherwise the badge is forced to spill onto a box.
  const widest = real.reduce((n, e) => Math.max(n, labelWidth(e.label || e.kind)), 0);
  const layerGap = Math.max(112, Math.min(200, widest + 28));

  const groupsByName = new Map<string, ElkNode>();
  const groupCounts = new Map<string, number>();
  for (const mod of modules) if (mod.group) groupCounts.set(mod.group, (groupCounts.get(mod.group) ?? 0) + 1);
  if (grouped) {
    for (const [name, count] of groupCounts) {
      if (count >= 2) groupsByName.set(name, {
        id: `group:${name}`,
        children: [],
        layoutOptions: { "elk.padding": "[top=48,left=28,bottom=28,right=28]" },
      });
    }
  }
  const children: ElkNode[] = [];
  const pushedGroups = new Set<string>();
  for (const mod of storyOrderedModules) {
    const leaf: ElkNode = { id: mod.id, ...size(mod) };
    const group = groupsByName.get(mod.group);
    if (group) {
      if (!pushedGroups.has(group.id)) {
        children.push(group);
        pushedGroups.add(group.id);
      }
      group.children?.push(leaf);
    } else children.push(leaf);
  }

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
      ...(groupsByName.size ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
    },
    children,
    edges: real.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const out = await elk.layout(root);

  const abs = new Map<string, Rect>();
  const parents = new Map<string, string | null>();
  const sections = new Map<string, { section: ElkEdgeSection; holder: string | null }>();
  const walk = (node: ElkNode, ox: number, oy: number, holder: string | null) => {
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0];
      if (section) sections.set(edge.id, { section, holder });
    }
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      abs.set(child.id, { x, y, w: child.width ?? 0, h: child.height ?? 0 });
      parents.set(child.id, holder);
      walk(child, x, y, child.id);
    }
  };
  walk(out, 0, 0, null);
  const placed = modules.flatMap((m) => {
    const box = abs.get(m.id);
    return box ? [{ id: m.id, x: snap(box.x), y: snap(box.y), w: box.w || 176, h: box.h || 72, m }] : [];
  });

  const xs = [...new Set(placed.map((p) => p.x))].sort((a, b) => a - b);
  const nodes: PNode[] = placed.map((p) => ({ ...p, depth: xs.indexOf(p.x) }));

  const pe: PEdge[] = real.flatMap((e) => {
    const hit = sections.get(e.id);
    const source = abs.get(e.from);
    const target = abs.get(e.to);
    if (!hit || !source || !target) return [];
    const raw = [hit.section.startPoint, ...(hit.section.bendPoints ?? []), hit.section.endPoint];
    const origin = (id: string | null) => id ? abs.get(id) ?? { x: 0, y: 0, w: 0, h: 0 } : { x: 0, y: 0, w: 0, h: 0 };
    const ancestors = new Set<string>();
    for (let p = parents.get(e.from) ?? null; p; p = parents.get(p) ?? null) ancestors.add(p);
    let lca: string | null = null;
    for (let p = parents.get(e.to) ?? null; p; p = parents.get(p) ?? null) if (ancestors.has(p)) { lca = p; break; }
    const distance = (x: number, y: number, r: Rect) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
    const candidates = [origin(null), origin(hit.holder), origin(lca)];
    let points = raw;
    let bestScore = Infinity;
    for (const offset of candidates) {
      const shifted = raw.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
      const score = distance(shifted[0].x, shifted[0].y, source) + distance(shifted.at(-1)!.x, shifted.at(-1)!.y, target);
      if (score < bestScore - 0.5) { points = shifted; bestScore = score; }
    }
    if (grouped && bestScore > 24) throw new Error("compound edge routing did not line up");
    const pts = points.map((p): [number, number] => [snap(p.x), snap(p.y)]);
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

  const groups: PGroup[] = groupsByName.size ? [...groupsByName].flatMap(([name, group]) => {
    const b = abs.get(group.id);
    return b ? [{ name, x: snap(b.x), y: snap(b.y), w: snap(b.w), h: snap(b.h) }] : [];
  }) : [...new Set(modules.map((m) => m.group).filter(Boolean))].flatMap(
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

  if (grouped) {
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          throw new Error("compound groups overlap");
        }
      }
    }
  }

  return {
    w: snap(out.width ?? 800),
    h: snap(out.height ?? 440),
    nodes,
    edges: pe,
    groups,
  };
}

export async function layout(modules: Module[], edges: Edge[], story: Story): Promise<Laid> {
  try {
    return await place(modules, edges, story, true);
  } catch {
    return place(modules, edges, story, false);
  }
}

```

## `sketch/rough.ts`

```ts

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

```

## `sketch/palette.ts`

```ts

import type { Edge, Module } from "@/lib/schema";

export const INK = "#0a0a0a";
export const STAGE_BG = "#f5f5f5";

/** Colour carries the role of a module. */
export const ROLE: Record<Module["role"], string> = {
  entry: "#ff5a1f",
  core: "#2a4bff",
  data: "#00a870",
  integration: "#f5a300",
  utility: "#8b5cf6",
  config: "#6b7280",
};

/** Colour carries the kind of a link. */
export const KIND: Record<Edge["kind"], string> = {
  call: "#0a0a0a",
  import: "#8a8a8a",
  type: "#8a8a8a",
  data: "#00a870",
  event: "#e11d74",
};

export const PALETTE = Object.values(ROLE);

```

## `lib/schema.ts`

```ts

import { z } from "zod";

export const STORY_SCHEMA_VERSION = 3;
export const GENERATOR_VERSION = "4";

export const Role = z.enum(["entry", "core", "data", "integration", "utility", "config"]);
export const Kind = z.enum(["service", "datastore", "queue", "external"]);
export const EdgeKind = z.enum(["import", "call", "data", "event", "type"]);
export const RuntimeEdgeKind = z.enum(["call", "data", "event"]);

export const Module = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  kind: Kind,
  purpose: z.string(),
  path: z.string(),
  files: z.array(z.string()),
  group: z.string(),
  tech: z.string().optional(),
  domain: z.string().optional(),
});

export const Edge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: EdgeKind,
  label: z.string(),
  inferred: z.boolean(),
  evidence: z.object({ path: z.string(), snippet: z.string() }),
});

export const StoryEvidence = z.object({
  moduleId: z.string(),
  path: z.string(),
  snippet: z.string(),
});

export const StoryAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enter"), moduleId: z.string() }),
  z.object({ kind: z.literal("exit"), moduleId: z.string() }),
  z.object({ kind: z.literal("traverse"), edgeId: z.string() }),
  z.object({ kind: z.literal("fork"), mode: z.enum(["independent", "exclusive"]), branchSceneIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("join"), branchSceneIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("return"), edgeId: z.string() }),
  z.object({
    kind: z.literal("spawn"),
    moduleId: z.string(),
    edgeId: z.string(),
    sceneId: z.string(),
    afterResponse: z.boolean(),
    afterSceneId: z.string(),
  }),
  z.object({
    kind: z.literal("effect"),
    moduleId: z.string(),
    effect: z.enum(["cache", "revalidation", "notification", "client-update", "write", "other"]),
    text: z.string(),
  }),
  z.object({ kind: z.literal("outcome"), result: z.enum(["success", "failure", "partial"]), text: z.string() }),
]);

export const StoryScene = z.object({
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  unverified: z.string().optional(),
  kind: z.enum(["spine", "branch", "deferred", "outcome", "failure"]),
  branchMode: z.enum(["independent", "exclusive"]).optional(),
  dependsOn: z.array(z.string()),
  parallelGroup: z.string().optional(),
  actions: z.array(StoryAction).min(1),
  evidence: z.array(StoryEvidence),
});

export const Story = z.object({
  scenes: z.array(StoryScene),
  contextOnly: z.array(z.object({ moduleId: z.string(), reason: z.string() })),
  completion: z.object({
    status: z.enum(["success", "partial", "failure"]),
    summary: z.string(),
    deferredSceneIds: z.array(z.string()),
  }),
});

export const Step = z.object({
  id: z.string(),
  moduleId: z.string(),
  edgeId: z.string(),
  title: z.string(),
  text: z.string(),
});

export const QA = z.object({ q: z.string(), a: z.string() });

const Interview = z.object({ pitch: z.string(), tradeoffs: z.array(z.string()), questions: z.array(QA) });
const LegacyMeta = z.object({ repo: z.string(), sha: z.string(), title: z.string(), generatedAt: z.string() });
const Meta = LegacyMeta.extend({
  generatorVersion: z.string(),
  storyVersion: z.number().int().nonnegative(),
});

const AnalysisFields = {
  summary: z.array(z.string()),
  stack: z.array(z.string()),
  modules: z.array(Module),
  edges: z.array(Edge),
  interview: Interview,
};

export const AnalysisCore = z.object({
  meta: Meta,
  ...AnalysisFields,
  story: Story,
});

const LegacyAnalysisCore = z.object({
  meta: LegacyMeta,
  ...AnalysisFields,
  flow: z.array(Step),
});

export const Analysis = AnalysisCore.extend({ codingPrompt: z.string() });
const LegacyAnalysis = LegacyAnalysisCore.extend({ codingPrompt: z.string() });

const CurrentStored = Analysis.extend({ id: z.string(), savedAt: z.number() });
const LegacyStored = LegacyAnalysis.extend({ id: z.string(), savedAt: z.number() });

/** Existing saved analyses remain readable and are presented as incomplete storyboards. */
export const Stored = z.union([CurrentStored, LegacyStored]).transform((value) => {
  if ("story" in value) return value;
  return { ...migrateLegacyAnalysis(value), id: value.id, savedAt: value.savedAt };
});

export const Stage = z.object({ id: z.string(), label: z.string(), detail: z.string() });

export const TraceItem = z.object({
  id: z.string(),
  kind: z.enum(["think", "read", "list", "search", "write"]),
  label: z.string().default(""),
  text: z.string().default(""),
  done: z.boolean().default(false),
});

export type Module = z.infer<typeof Module>;
export type Edge = z.infer<typeof Edge>;
export type RuntimeEdgeKind = z.infer<typeof RuntimeEdgeKind>;
export type StoryEvidence = z.infer<typeof StoryEvidence>;
export type StoryAction = z.infer<typeof StoryAction>;
export type StoryScene = z.infer<typeof StoryScene>;
export type Story = z.infer<typeof Story>;
export type Step = z.infer<typeof Step>;
export type AnalysisCore = z.infer<typeof AnalysisCore>;
export type Analysis = z.infer<typeof Analysis>;
export type Stored = z.infer<typeof Stored>;
export type Stage = z.infer<typeof Stage>;
export type TraceItem = z.infer<typeof TraceItem>;

function migrateLegacyAnalysis(value: z.infer<typeof LegacyAnalysis>): Analysis {
  const moduleIds = new Set(value.modules.map((module) => module.id));
  const edgeById = new Map(value.edges.map((edge) => [edge.id, edge]));
  const scenes: StoryScene[] = [];
  const visited = new Set<string>();
  let previousModuleId: string | null = null;
  let previousSceneId: string | null = null;

  for (const step of value.flow) {
    if (!moduleIds.has(step.moduleId)) {
      continue;
    }

    if (!previousModuleId && !step.edgeId) {
      const scene: StoryScene = {
        id: step.id,
        title: step.title,
        caption: step.text,
        kind: "spine",
        dependsOn: [],
        actions: [{ kind: "enter", moduleId: step.moduleId }],
        evidence: [],
      };
      scenes.push(scene);
      visited.add(step.moduleId);
      previousModuleId = step.moduleId;
      previousSceneId = scene.id;
      continue;
    }

    const edge = edgeById.get(step.edgeId);
    if (
      !edge ||
      !["call", "data", "event"].includes(edge.kind) ||
      edge.from !== previousModuleId ||
      edge.to !== step.moduleId
    ) {
      continue;
    }

    const scene: StoryScene = {
      id: step.id,
      title: step.title,
      caption: step.text,
      kind: "spine",
      dependsOn: previousSceneId ? [previousSceneId] : [],
      actions: [{ kind: "traverse", edgeId: edge.id }],
      evidence: [],
    };
    scenes.push(scene);
    visited.add(edge.from);
    visited.add(edge.to);
    previousModuleId = step.moduleId;
    previousSceneId = scene.id;
  }

  const contextOnly = value.modules
    .filter((module) => !visited.has(module.id))
    .map((module) => ({ moduleId: module.id, reason: "This older single-path storyboard did not verify this module as an executed step." }));
  const story: Story = {
    scenes,
    contextOnly,
    completion: {
      status: "partial",
      summary: "This saved analysis uses the earlier single-path storyboard and cannot establish complete branch coverage.",
      deferredSceneIds: [],
    },
  };

  return {
    ...value,
    meta: { ...value.meta, generatorVersion: "legacy", storyVersion: 1 },
    story,
  };
}

export function fromLegacyAnalysis(value: unknown): Analysis {
  return migrateLegacyAnalysis(LegacyAnalysis.parse(value));
}

```
