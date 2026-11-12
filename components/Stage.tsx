import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
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
      <div aria-live="polite" className="min-h-[9.5rem] min-w-0 flex-1">
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
          travel={props.trace.travelSec}
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

