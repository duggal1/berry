import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { analyzeRepo } from "./api";
import { saveAnalysis } from "./store";
import type { Analysis, AnalysisCore, Stage } from "./schema";

export type Route =
  | { name: "home" }
  | { name: "example" }
  | { name: "run"; url: string }
  | { name: "local"; id: string }
  | { name: "shared"; id: string };

function parse(hash: string): Route {
  const [a, b] = hash.replace(/^#\/?/, "").split("/");
  let arg = "";
  try {
    arg = b ? decodeURIComponent(b) : "";
  } catch {
    arg = "";
  }
  if (a === "example") return { name: "example" };
  if (a === "run" && arg) return { name: "run", url: arg };
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

export function useTrace(n: number) {
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 3000);
    return () => clearTimeout(t);
  }, [playing, step, n]);

  return {
    step,
    playing,
    go: (i: number) => {
      setPlaying(false);
      setStep(Math.max(-1, Math.min(n - 1, i)));
    },
    next: () => {
      setPlaying(false);
      setStep((s) => Math.min(n - 1, s + 1));
    },
    prev: () => {
      setPlaying(false);
      setStep((s) => Math.max(-1, s - 1));
    },
    clear: () => {
      setPlaying(false);
      setStep(-1);
    },
    toggle: () => {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (n === 0) return;
      setStep((s) => (s >= n - 1 ? 0 : Math.max(s, 0)));
      setPlaying(true);
    },
  };
}

export type Trace = ReturnType<typeof useTrace>;

export function useAnalysisRun(url: string, token: string | null) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [core, setCore] = useState<AnalysisCore | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    let latest: AnalysisCore | null = null;
    let text = "";
    (async () => {
      try {
        for await (const ev of analyzeRepo(url, token, ac.signal)) {
          if (ev.type === "stage") setStages((s) => [...s.filter((x) => x.id !== ev.stage.id), ev.stage]);
          else if (ev.type === "analysis") {
            latest = ev.analysis;
            setCore(ev.analysis);
          } else if (ev.type === "prompt") {
            text += ev.text;
            setPrompt(text);
          } else if (latest) {
            const rec = await saveAnalysis({ ...latest, codingPrompt: text });
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
    return () => ac.abort();
  }, [url, token]);

  const analysis = useMemo<Analysis | null>(
    () => (core ? { ...core, codingPrompt: prompt } : null),
    [core, prompt],
  );
  return { stages, analysis, status, error };
}
