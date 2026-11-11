import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { analyzeRepo } from "./api";
import { saveAnalysis } from "./store";
import type { Analysis, AnalysisCore, Stage, Story, TraceItem } from "./schema";
import { INITIAL_TIMELINE, reduceTimeline } from "./timeline";

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

export function useTrace(story: Story) {
  const scenes = story.scenes;
  const [timeline, dispatch] = useReducer(reduceTimeline, INITIAL_TIMELINE);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const setDuration = useCallback((id: string, durationMs: number) => {
    setDurations((current) => current[id] === durationMs ? current : { ...current, [id]: durationMs });
  }, []);

  useEffect(() => {
    const scene = scenes[timeline.sceneIndex];
    const duration = scene ? durations[scene.id] : undefined;
    if (!timeline.playing || !scene || !duration) return;

    let frame = 0;
    const tick = (now: number) => {
      dispatch({ type: "tick", sceneCount: scenes.length, durationMs: duration, now });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durations, scenes, timeline.playing, timeline.sceneIndex]);

  const seek = (index: number) => {
    dispatch({ type: "seek", sceneCount: scenes.length, sceneIndex: index });
    if (index < 0) setCameraResetKey((current) => current + 1);
  };

  const adjust = (delta: number) => seek(timeline.sceneIndex + delta);

  return {
    step: timeline.sceneIndex,
    playing: timeline.playing,
    progress: timeline.progress,
    cameraResetKey,
    go: seek,
    next: () => adjust(1),
    prev: () => adjust(-1),
    clear: () => seek(-1),
    restart: () => {
      dispatch({ type: "restart", sceneCount: scenes.length, now: performance.now() });
      setCameraResetKey((current) => current + 1);
    },
    setDuration,
    toggle: () => {
      if (timeline.playing) {
        const scene = scenes[timeline.sceneIndex];
        dispatch({
          type: "pause",
          now: performance.now(),
          durationMs: scene ? durations[scene.id] ?? 0 : 0,
        });
        return;
      }
      if (scenes.length === 0) return;
      if (timeline.sceneIndex < 0 || timeline.sceneIndex >= scenes.length - 1) {
        setCameraResetKey((current) => current + 1);
      }
      dispatch({ type: "play", sceneCount: scenes.length, now: performance.now() });
    },
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
