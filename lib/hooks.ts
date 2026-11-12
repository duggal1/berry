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

/** Geometry-free timing, so a scene never waits on layout and never drags. */
function timing(scene: StoryScene | undefined) {
  if (!scene) return { travel: 0, total: 0 };
  const moves = scene.actions.some((a) => a.kind === "traverse" || a.kind === "return" || a.kind === "spawn");
  const words = `${scene.title} ${scene.caption}`.trim().split(/\s+/).filter(Boolean).length;
  const read = Math.min(2800, Math.max(1000, 600 + words * 60));
  const travel = moves ? 750 : 0;
  return { travel, total: Math.max(read, travel + 350) };
}

export function useTrace(story: Story) {
  const scenes = story.scenes;
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1.5);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  // Progress lives in a motion value. React renders once per scene, never per frame.
  const progress = useMotionValue(0);
  const run = useRef(0);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const stop = useCallback(() => {
    run.current += 1;
    anim.current?.stop();
    anim.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(
    (index: number, chain: boolean) => {
      stop();
      const id = run.current;
      const scene = scenes[index];
      setStep(index);
      progress.jump(0);
      if (!scene) return;

      const k = speedRef.current;
      const { travel, total } = timing(scene);
      const finish = () => {
        if (run.current !== id || !chain) return;
        if (index >= scenes.length - 1) {
          setPlaying(false);
          return;
        }
        show(index + 1, true);
      };
      const hold = () => {
        timer.current = setTimeout(finish, Math.max(0, total - travel) / k);
      };

      if (travel > 0) {
        anim.current = animate(progress, 1, {
          duration: travel / 1000 / k,
          ease: [0.45, 0, 0.2, 1],
          onComplete: hold,
        });
      } else {
        progress.jump(1);
        hold();
      }
    },
    [progress, scenes, stop],
  );

  useEffect(() => {
    stop();
    setStep(-1);
    setPlaying(false);
    progress.jump(0);
  }, [story, stop, progress]);
  useEffect(() => () => stop(), [stop]);

  const go = (i: number) => {
    setPlaying(false);
    const idx = Math.max(-1, Math.min(scenes.length - 1, i));
    if (idx < 0) {
      stop();
      setStep(-1);
      progress.jump(0);
      setCameraResetKey((c) => c + 1);
      return;
    }
    show(idx, false);
  };

  return {
    step,
    playing,
    progress,
    speed,
    setSpeed,
    travelSec: timing(scenes[step]).travel / 1000 / speed,
    cameraResetKey,
    go,
    next: () => go(step + 1),
    prev: () => go(step - 1),
    clear: () => go(-1),
    restart: () => {
      setCameraResetKey((c) => c + 1);
      setPlaying(true);
      show(0, true);
    },
    toggle: () => {
      if (playing) {
        stop();
        setPlaying(false);
        return;
      }
      if (scenes.length === 0) return;
      const from = step < 0 || step >= scenes.length - 1 ? 0 : step;
      if (from === 0) setCameraResetKey((c) => c + 1);
      setPlaying(true);
      show(from, true);
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
