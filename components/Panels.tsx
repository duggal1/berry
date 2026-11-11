import { useEffect, useRef, useState } from "react";
import { askRepo } from "@/lib/api";
import type { Turn } from "@/lib/api";
import { slug } from "@/lib/repo";
import type { Analysis, Step } from "@/lib/schema";
import { ROLE } from "@/sketch/palette";
import { Accordion } from "./Accordion";
import { Button, Chip } from "./ui";

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
              <span className="t-mono mt-1 hidden shrink-0 text-neutral-400 sm:block">{m.path}</span>
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
        <Button onClick={copy} disabled={!text}>
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Button tone="quiet" onClick={download} disabled={!text}>
          Download .md
        </Button>
        <span className="text-[15px] text-neutral-500">
          Paste it into your coding agent before you ask for changes.
        </span>
      </div>
      <pre className="t-mono mt-5 max-h-[640px] overflow-auto whitespace-pre-wrap bg-neutral-100 p-6 text-[14px] leading-[1.7] text-neutral-800">
        {text || (running ? "Writing the prompt." : "This analysis has no prompt.")}
      </pre>
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
              onClick={() => send(s)}
              className="bg-neutral-100 px-4 py-3 text-left text-[16px] font-medium tracking-tight transition-colors duration-100 hover:bg-neutral-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-6">
        {msgs.map((m, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap leading-[1.55] ${
              m.role === "user" ? "text-[22px] font-semibold tracking-tight" : "text-[18px] text-neutral-700"
            }`}
          >
            {m.text || "…"}
          </p>
        ))}
      </div>
      {err && <p className="mt-5 text-[16px] font-medium">{err}</p>}
      <form
        className="mt-8 flex items-end gap-2 bg-neutral-100 p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-neutral-950"
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
      >
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(q);
            }
          }}
          rows={2}
          placeholder="Ask about any module or link"
          className="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-[17px] outline-none placeholder:text-neutral-400"
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          Ask
        </Button>
      </form>
    </div>
  );
}
