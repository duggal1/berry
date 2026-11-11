import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { shareAnalysis } from "@/lib/api";
import { useTrace } from "@/lib/hooks";
import { EASE_QUINT } from "@/lib/motion";
import { prefs } from "@/lib/prefs";
import type { Analysis } from "@/lib/schema";
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
}: {
  analysis: Analysis;
  running?: boolean;
  demo?: boolean;
  below?: boolean;
  onSaveCopy?: () => void;
}) {
  const trace = useTrace(analysis.flow.length);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const stageRef = useRef<HTMLDivElement>(null);
  const data = useMemo(
    () => ({ modules: analysis.modules, edges: analysis.edges, flow: analysis.flow }),
    [analysis.modules, analysis.edges, analysis.flow],
  );
  const picked = analysis.modules.find((m) => m.id === selected);
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
        {picked && <ModuleDetail m={picked} analysis={analysis} onClose={() => setSelected(null)} />}

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
              analysis={analysis}
              onPick={(id) => {
                setSelected(id);
                toStage();
              }}
            />
          )}
          {tab === "path" && (
            <FlowPane
              flow={analysis.flow}
              step={trace.step}
              go={(i) => {
                trace.go(i);
                toStage();
              }}
            />
          )}
          {tab === "prompt" && <PromptPane analysis={analysis} running={running} />}
          {tab === "interview" && <InterviewPane analysis={analysis} />}
          {tab === "ask" && <AskPane analysis={analysis} demo={demo} />}
        </div>
      </div>
    </main>
  );
}
