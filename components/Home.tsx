"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { EXAMPLE } from "@/lib/fixture";
import { useInViewOnce, useTrace } from "@/lib/hooks";
import { prefs } from "@/lib/prefs";
import { parseRepo } from "@/lib/repo";
import { deleteAnalysis, listAnalyses } from "@/lib/store";
import type { Stored } from "@/lib/schema";
import { PALETTE, ROLE } from "@/sketch/palette";
import { Accordion } from "./Accordion";
import { Stage } from "./Stage";
import { Button, Chip, CloseIcon } from "./ui";

const FAQ = [
  {
    q: "Does it read my code?",
    a: "Yes. An AI agent opens files in your repo to explain them, so file contents go to the AI provider for that run. Instructions written inside the repo are ignored.",
  },
  {
    q: "Does it work on private repos?",
    a: "Yes, with a GitHub token that can read the repo. The token is used for that run only and is not stored on the server. You can keep it in this browser if you choose.",
  },
  {
    q: "Where is my analysis saved?",
    a: "In this browser, in IndexedDB. Nothing leaves your device until you press Share link, which uploads the analysis, including the short code snippets it uses as evidence.",
  },
  {
    q: "How do I know the sketch is real?",
    a: "Every module, file and link is checked against the repo before it reaches you. Solid lines were found in the code. Dashed lines are inferred and name the file that backs them. Anything that fails the check is dropped.",
  },
];

const GIVES = [
  {
    color: ROLE.entry,
    title: "The architecture, drawn from the code.",
    body: "Every box is a module found in your repo. Dashed lines are links the agent inferred, each with the file that backs it.",
  },
  {
    color: ROLE.core,
    title: "One request, traced hop by hop.",
    body: "A pen follows the path from entry to result and shows the line of code behind every hop.",
  },
  {
    color: ROLE.data,
    title: "A prompt your coding agent starts from.",
    body: "Paste it into any agent so it begins with your architecture instead of a blank context.",
  },
];

function Period() {
  const reduce = useReducedMotion() ?? false;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % PALETTE.length), 1600);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <span
      aria-hidden
      className="ml-[0.05em] inline-block size-[0.15em]"
      style={{ background: PALETTE[i] }}
    />
  );
}

const NEVER = () => () => {};

/** Read a stored value without breaking hydration: the server snapshot is always empty. */
function useStored(read: () => string | null): string | null {
  return useSyncExternalStore(NEVER, read, () => null);
}

function RepoForm({ onStart }: { onStart: (url: string, token: string | null) => void }) {
  const storedUrl = useStored(() => prefs.lastUrl());
  const storedToken = useStored(() => prefs.token());

  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [remember, setRemember] = useState<boolean | null>(null);
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [err, setErr] = useState("");

  const urlValue = url ?? storedUrl ?? "";
  const tokenValue = token ?? storedToken ?? "";
  const rememberValue = remember ?? Boolean(storedToken);
  const open = openOverride ?? Boolean(storedToken);

  function submit() {
    const repo = parseRepo(urlValue);
    if (!repo) {
      setErr("Use a GitHub URL like github.com/owner/repo.");
      return;
    }
    prefs.setLastUrl(repo);
    prefs.setToken(rememberValue && tokenValue ? tokenValue : null);
    onStart(repo, tokenValue.trim() || null);
  }

  return (
    <form
      className="mt-10 max-w-[44rem]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={urlValue}
          onChange={(e) => {
            setUrl(e.target.value);
            setErr("");
          }}
          aria-label="GitHub repository"
          placeholder="github.com/owner/repo"
          autoCapitalize="off"
          spellCheck={false}
          className="h-16 min-w-0 flex-1 bg-neutral-100 px-5 text-[20px] outline-none placeholder:text-neutral-400 focus:bg-neutral-200/70"
        />
        <Button type="submit" className="h-16 px-8 text-[18px]">
          Explain
        </Button>
      </div>
      {err && <p className="mt-3 text-[16px] font-medium">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[16px]">
        <button
          type="button"
          onClick={() => setOpenOverride(!open)}
          className="underline decoration-2 underline-offset-4 hover:decoration-neutral-400"
        >
          {open ? "Hide token" : "Private repo?"}
        </button>
        <a
          href="#/example"
          className="underline decoration-2 underline-offset-4 hover:decoration-neutral-400"
        >
          Open the example
        </a>
      </div>
      {open && (
        <div className="mt-4">
          <input
            type="password"
            value={tokenValue}
            onChange={(e) => setToken(e.target.value)}
            aria-label="GitHub token"
            placeholder="GitHub token with read access"
            autoComplete="off"
            className="h-14 w-full bg-neutral-100 px-5 text-[17px] outline-none placeholder:text-neutral-400 focus:bg-neutral-200/70"
          />
          <label className="mt-3 flex items-center gap-2 text-[16px] text-neutral-600">
            <input
              type="checkbox"
              checked={rememberValue}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-neutral-950"
            />
            Remember on this device
          </label>
        </div>
      )}
    </form>
  );
}

function Preview() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const trace = useTrace(EXAMPLE.flow.length);
  const [selected, setSelected] = useState<string | null>(null);
  const last = EXAMPLE.flow.length - 1;

  useEffect(() => {
    if (!seen) return;
    const t = setTimeout(() => trace.toggle(), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  useEffect(() => {
    if (!seen || trace.playing || trace.step < last) return;
    const t = setTimeout(() => trace.clear(), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, trace.playing, trace.step]);

  return (
    <div ref={ref} className="mt-20">
      <Stage
        data={EXAMPLE}
        title="Architecture of an example orders API"
        trace={trace}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

function ago(t: number) {
  const s = (t - Date.now()) / 1000;
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [u, sec] of units) if (Math.abs(s) >= sec) return f.format(Math.round(s / sec), u);
  return "just now";
}

function History() {
  const [items, setItems] = useState<Stored[]>([]);
  useEffect(() => {
    let live = true;
    listAnalyses()
      .then((l) => live && setItems(l))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (items.length === 0) return null;

  return (
    <section className="mx-auto mt-32 max-w-5xl px-5 md:px-10">
      <h2 className="t-h2">Recent.</h2>
      <ul className="mt-8 flex max-w-[44rem] flex-col gap-2">
        {items.slice(0, 8).map((a) => (
          <li
            key={a.id}
            className="flex items-center bg-neutral-100 transition-colors duration-100 hover:bg-neutral-200/70"
          >
            <a
              href={`#/r/${encodeURIComponent(a.id)}`}
              className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4"
            >
              <span className="truncate text-[19px] font-semibold tracking-tight">{a.meta.repo}</span>
              <Chip i={1}>{a.meta.sha.slice(0, 7)}</Chip>
              <span className="ml-auto shrink-0 text-[14px] text-neutral-500">{ago(a.savedAt)}</span>
            </a>
            <button
              type="button"
              aria-label={`Delete ${a.meta.repo}`}
              onClick={async () => {
                await deleteAnalysis(a.id);
                setItems((l) => l.filter((x) => x.id !== a.id));
              }}
              className="mr-1 grid size-11 shrink-0 place-items-center text-neutral-500 transition-colors duration-100 hover:bg-neutral-300 hover:text-neutral-950"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Home({ onStart }: { onStart: (url: string, token: string | null) => void }) {
  return (
    <main className="w-full pb-28">
      <section className="mx-auto max-w-[1680px] px-5 pt-32 md:px-10 md:pt-40">
        <h1 className="t-hero">
          See how
          <br />
          it runs
          <Period />
        </h1>
        <p className="t-lead mt-8 max-w-[40rem]">
          Paste a GitHub URL. Get your architecture as a sketch, the path one request takes through it,
          and a prompt that briefs a coding agent. Built for the ten minutes before an interview.
        </p>
        <RepoForm onStart={onStart} />
      </section>

      <Preview />

      <section className="mx-auto mt-32 max-w-5xl px-5 md:px-10">
        <ul className="flex flex-col gap-14">
          {GIVES.map((g) => (
            <li key={g.title}>
              <h2 className="t-h2 flex items-baseline gap-4">
                <span
                  aria-hidden
                  className="size-[0.3em] shrink-0"
                  style={{ background: g.color }}
                />
                {g.title}
              </h2>
              <p className="t-lead mt-4 max-w-[36rem] pl-[calc(0.3em+1rem)]">{g.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <History />

      <section className="mx-auto mt-32 grid max-w-5xl gap-10 px-5 lg:grid-cols-[1fr_36rem] md:px-10">
        <h2 className="t-h1">Questions.</h2>
        <Accordion items={FAQ} />
      </section>
    </main>
  );
}
