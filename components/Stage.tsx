import { useMemo, useState } from "react";
import { useInViewOnce, useTrace } from "@/lib/hooks";
import type { Trace } from "@/lib/hooks";
import type { Step } from "@/lib/schema";
import { Diagram } from "@/sketch/Diagram";
import type { DiagramData } from "@/sketch/Diagram";
import { INK, KIND, ROLE } from "@/sketch/palette";
import { ArrowIcon, ChevronIcon, IconButton, PauseIcon, PlayIcon } from "./ui";

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

function TraceBar({ trace, flow }: { trace: Trace; flow: Step[] }) {
  const cur = trace.step >= 0 ? flow[trace.step] : undefined;
  return (
    <div className="relative mx-auto flex max-w-[1680px] flex-col gap-4 px-5 pb-6 pt-2 md:flex-row md:items-center md:gap-6 md:px-10">
      <div className="flex shrink-0 gap-2">
        <IconButton label="Previous step" onClick={trace.prev} disabled={trace.step < 0}>
          <ChevronIcon dir="left" />
        </IconButton>
        <IconButton
          label={trace.playing ? "Pause" : "Trace one request"}
          onClick={trace.toggle}
          disabled={flow.length === 0}
        >
          {trace.playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton label="Next step" onClick={trace.next} disabled={trace.step >= flow.length - 1}>
          <ChevronIcon dir="right" />
        </IconButton>
      </div>
      <div aria-live="polite" className="min-h-[3.75rem] min-w-0 flex-1">
        {cur ? (
          <>
            <p className="text-[22px] font-semibold leading-[1.1] tracking-tight md:text-[28px]">
              {cur.title}
            </p>
            <p className="mt-1 text-[16px] leading-[1.45] text-neutral-600">{cur.text}</p>
          </>
        ) : (
          <p className="text-[18px] leading-[1.4] text-neutral-600 md:text-[20px]">
            Press play. A pen follows one real request through the system.
          </p>
        )}
      </div>
      {cur && (
        <span className="t-mono shrink-0 text-[13px] tabular-nums text-neutral-500">
          {trace.step + 1} / {flow.length}
        </span>
      )}
    </div>
  );
}

function Legend({ data }: { data: DiagramData }) {
  const roles = useMemo(() => [...new Set(data.modules.map((m) => m.role))], [data.modules]);
  const kinds = useMemo(() => [...new Set(data.edges.map((e) => e.kind))], [data.edges]);
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
  canvasHref?: string;
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
          {props.canvasHref && (
            <a
              href={props.canvasHref}
              className="t-mono inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-neutral-600 transition-colors hover:text-neutral-950"
            >
              open canvas
              <ArrowIcon size={12} />
            </a>
          )}
        </div>
        <Diagram
          data={props.data}
          title={props.title}
          play={seen}
          step={props.trace.step}
          selected={props.selected}
          onSelect={props.onSelect}
          height="min(68vh, 720px)"
          toolbar={null}
        />
      </div>
      <TraceBar trace={props.trace} flow={props.data.flow} />
      <Legend data={props.data} />
    </section>
  );
}

export function CanvasStage(props: {
  data: DiagramData;
  title: string;
  id: string;
  onBack: () => void;
}) {
  const trace = useTrace(props.data.flow.length);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200/60 px-5 py-3 md:px-10">
        <a
          href={`#/r/${props.id}`}
          className="inline-flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em] text-neutral-700 transition-colors hover:text-neutral-950"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to the report
        </a>
        <p className="truncate text-[13px] text-neutral-500">
          {props.title} · {props.data.modules.length} modules
        </p>
      </div>
      <div className="relative flex-1 min-h-0 bg-neutral-100">
        <Diagram
          data={props.data}
          title={props.title}
          play={true}
          step={trace.step}
          selected={selected}
          onSelect={setSelected}
          height="100%"
          zoomOnWheel={true}
        />
        <DotField />
      </div>
      <TraceBar trace={trace} flow={props.data.flow} />
    </div>
  );
}
