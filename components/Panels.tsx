import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { askRepo } from "@/lib/api";
import type { Turn } from "@/lib/api";
import { EASE_QUINT } from "@/lib/motion";
import { slug } from "@/lib/repo";
import type { Analysis, Step } from "@/lib/schema";
import { INK, ROLE } from "@/sketch/palette";
import { Accordion } from "./Accordion";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { Button, Chip, Pulse, Segmented, wipe } from "./ui";

export function SummaryPane({
  analysis,
  onPick,
}: {
  analysis: Analysis;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="max-w-[44rem] text-[clamp(1.3rem,2.2vw,1.9rem)] leading-[1.3] tracking-tight">
        {analysis.summary.join(" ")}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {analysis.stack.map((s, i) => (
          <Chip key={s} i={i}>
            {s}
          </Chip>
        ))}
      </div>
      <ul className="mt-12 flex flex-col gap-2">
        {analysis.modules.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onPick(m.id)}
              className="flex w-full items-start gap-4 bg-neutral-50 px-5 py-5 text-left transition-colors duration-100 hover:bg-neutral-100"
            >
              <span className="mt-2 size-3 shrink-0" style={{ background: ROLE[m.role] }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[22px] font-semibold leading-[1.1] tracking-tight">
                  {m.name}
                </span>
                <span className="mt-1 block text-[16px] leading-[1.45] text-neutral-600">{m.purpose}</span>
              </span>
              <span className="t-mono mt-1 hidden shrink-0 text-neutral-500 sm:block">{m.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlowPane({
  flow,
  step,
  go,
}: {
  flow: Step[];
  step: number;
  go: (i: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {flow.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => go(i)}
            className={`flex w-full gap-5 px-5 py-5 text-left transition-colors duration-100 ${
              i === step ? "bg-neutral-950 text-white" : "bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <span className="t-mono w-8 shrink-0 pt-1.5 text-[13px] tabular-nums opacity-60">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              <span className="block text-[22px] font-semibold leading-[1.1] tracking-tight">
                {s.title}
              </span>
              <span
                className={`mt-1.5 block text-[16px] leading-[1.5] ${
                  i === step ? "text-neutral-300" : "text-neutral-600"
                }`}
              >
                {s.text}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function PromptPane({ analysis, running }: { analysis: Analysis; running: boolean }) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"rendered" | "raw">("rendered");
  const text = analysis.codingPrompt;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(analysis.meta.repo)}-architecture.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          id="prompt-view"
          value={view}
          onChange={setView}
          options={[
            { id: "rendered", label: "Rendered" },
            { id: "raw", label: "Raw" },
          ]}
        />
        <Button onClick={copy} disabled={!text}>
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Button tone="quiet" onClick={download} disabled={!text}>
          Download .md
        </Button>
      </div>
      <p className="mt-3 text-[15px] tracking-[-0.01em] text-neutral-500">
        Paste it into your coding agent before you ask for changes.
      </p>

      <div className="mt-6 max-h-[720px] overflow-auto bg-neutral-50 px-6 py-8 md:px-10 md:py-10">
        {!text ? (
          <Pulse label={running ? "Writing the prompt" : "This analysis has no prompt"} />
        ) : (
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE_QUINT }}
          >
            {view === "rendered" ? (
              <Markdown text={text} />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-[13.5px] font-medium leading-[1.75] tracking-[-0.01em] text-neutral-800 antialiased">
                {text}
              </pre>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function InterviewPane({ analysis }: { analysis: Analysis }) {
  const { pitch, tradeoffs, questions } = analysis.interview;
  return (
    <div className="space-y-14">
      <section>
        <h3 className="t-h3">Your pitch</h3>
        <p className="mt-4 max-w-[44rem] text-[clamp(1.2rem,2vw,1.6rem)] leading-[1.35] tracking-tight text-neutral-700">
          {pitch}
        </p>
      </section>
      <section>
        <h3 className="t-h3">Tradeoffs to own</h3>
        <ul className="mt-4 max-w-[44rem] space-y-3">
          {tradeoffs.map((t) => (
            <li key={t} className="flex gap-4 text-[18px] leading-[1.5] text-neutral-700">
              <span className="mt-2.5 size-2 shrink-0 bg-neutral-950" />
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="t-h3 mb-5">Likely questions</h3>
        <Accordion items={questions} />
      </section>
    </div>
  );
}

export function AskPane({ analysis, demo }: { analysis: Analysis; demo: boolean }) {
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const lead = analysis.modules.find((m) => m.role !== "entry") ?? analysis.modules[0];
  const ideas = [
    lead ? `Why is ${lead.name} its own module?` : "Walk me through the riskiest module.",
    "What would you change first?",
    "How does data move end to end?",
  ];

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setErr("");
    setQ("");
    setBusy(true);
    const history = msgs;
    setMsgs([...history, { role: "user", text: question }, { role: "assistant", text: "" }]);
    const ac = new AbortController();
    abort.current = ac;
    try {
      for await (const d of askRepo(analysis, question, history, ac.signal)) {
        setMsgs((m) => {
          const c = m.slice();
          const last = c[c.length - 1];
          c[c.length - 1] = { ...last, text: last.text + d };
          return c;
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[44rem]">
      {demo && (
        <p className="mb-5 text-[16px] text-neutral-500">
          Asking needs the backend. This example runs without it.
        </p>
      )}
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {ideas.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              style={wipe(INK)}
              className="btn bg-neutral-100 px-4 py-3 text-left text-[16px] font-medium tracking-[-0.02em] transition-colors delay-100 duration-200 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-10">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="text-[24px] font-semibold leading-[1.15] tracking-[-0.03em]">
              {m.text}
            </p>
          ) : m.text ? (
            <Markdown key={i} text={m.text} />
          ) : busy && i === msgs.length - 1 ? (
            <Pulse key={i} label="Reading the repo" />
          ) : (
            <p key={i} className="t-mono text-neutral-400">
              stopped
            </p>
          ),
        )}
      </div>
      {err && <p className="mt-5 text-[16px] font-medium">{err}</p>}
      <Composer
        value={q}
        onChange={setQ}
        onSend={() => void send(q)}
        onStop={() => abort.current?.abort()}
        busy={busy}
      />
    </div>
  );
}
