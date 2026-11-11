"use client";
import { useEffect, useState } from "react";
import { deleteAnalysis, listAnalyses } from "@/lib/store";
import type { Stored } from "@/lib/schema";

function ago(t: number): string {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function History() {
  const [rows, setRows] = useState<Stored[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listAnalyses();
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    try {
      setRows(await listAnalyses());
    } catch {
      setRows([]);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await deleteAnalysis(id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 pt-28 md:px-10 md:pt-32">
      <div className="mb-12 flex items-end justify-between gap-6">
        <div>
          <p className="t-mono mb-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            local history
          </p>
          <h1 className="t-h1 max-w-[14ch]">Every sketch, kept on this machine.</h1>
          <p className="t-lead mt-4 max-w-[44rem]">
            Analyses are saved to this browser the moment they finish. Nothing leaves the
            machine unless you share a link.
          </p>
        </div>
        <a
          href="#/"
          className="hidden h-10 items-center bg-neutral-950 px-5 text-[15px] font-medium tracking-tight text-white transition-colors duration-100 hover:bg-neutral-700 md:inline-flex"
        >
          Explain a repo
        </a>
      </div>

      {rows === null && <p className="text-[15px] text-neutral-500">Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <div className="bg-neutral-100 px-8 py-16">
          <p className="t-h3">Nothing here yet.</p>
          <p className="mt-2 text-[15px] text-neutral-600">
            Explain a repository and the sketch will land in this list.
          </p>
          <a
            href="#/"
            className="mt-6 inline-flex h-10 items-center bg-neutral-950 px-5 text-[15px] font-medium tracking-tight text-white transition-colors duration-100 hover:bg-neutral-700"
          >
            Explain a repo
          </a>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="flex flex-col gap-px bg-neutral-200/70">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-6 bg-white px-6 py-5 transition-colors hover:bg-neutral-50">
              <a href={`#/r/${r.id}`} className="min-w-0 flex-1">
                <p className="t-h3 truncate">{r.meta.title}</p>
                <p className="t-mono mt-1 truncate text-[12px] text-neutral-500">
                  {r.meta.repo} · {r.meta.sha.slice(0, 7)} · {r.modules.length} modules · {ago(r.savedAt)}
                </p>
              </a>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                disabled={busy === r.id}
                className="t-mono shrink-0 text-[11px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-neutral-950 disabled:opacity-40"
              >
                {busy === r.id ? "removing…" : "remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}