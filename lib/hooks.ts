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
