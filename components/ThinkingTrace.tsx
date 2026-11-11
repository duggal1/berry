import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_STD, SPRING } from "@/lib/motion";
import type { Stage, TraceItem } from "@/lib/schema";
import { INK, ROLE } from "@/sketch/palette";
import { ArrowIcon, Button, Pulse } from "./ui";

const TAU = 120; // ms. lower = snappier follow
const NEAR = 28; // px from bottom that counts as "at the bottom"

/** Follows the bottom of a growing scroller. Detaches when the person scrolls up. */
export function useStickToBottom() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const user = useRef(false);
  const raf = useRef(0);
  const last = useRef(0);
  const [detached, setDetached] = useState(false);
  const reduce = useReducedMotion() ?? false;

  const frame = useCallback(
    function loop(now: number) {
      raf.current = 0;
      const el = scroller.current;
      if (!el || !stuck.current) {
        last.current = 0;
        return;
      }
      const dt = Math.min(50, last.current ? now - last.current : 16);
      last.current = now;
      const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
      if (gap < 0.5) {
        last.current = 0;
        return;
      }
      const move = reduce ? gap : Math.min(gap, Math.max(1, gap * (1 - Math.exp(-dt / TAU))));
      el.scrollTop += move;
      raf.current = requestAnimationFrame(loop);
    },
    [reduce],
  );

  const wake = useCallback(() => {
    if (!raf.current && stuck.current) raf.current = requestAnimationFrame(frame);
  }, [frame]);

  const attach = useCallback(() => {
    stuck.current = true;
    setDetached(false);
    wake();
  }, [wake]);

  const detach = useCallback(() => {
    stuck.current = false;
    setDetached(true);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    let timer = 0;
    const touch = () => {
      user.current = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (user.current = false), 160);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) detach();
      touch();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") detach();
    };
    const down = () => (user.current = true);
    const up = () => (user.current = false);
    const onScroll = () => {
      const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
      if (gap <= NEAR) {
        if (!stuck.current) attach();
      } else if (user.current) detach();
    };

    const ro = new ResizeObserver(() => wake());
    ro.observe(inner);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", touch, { passive: true });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", down);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerup", up);
    wake();
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", touch);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerup", up);
      window.clearTimeout(timer);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [attach, detach, wake]);

  return { scroller, content, detached, jump: attach };
}

/** Drains streamed text at an adaptive pace so token bursts read as one smooth flow. */
export function useSmoothText(target: string, live: boolean): string {
  const [n, setN] = useState(() => (live ? 0 : target.length));
  const shown = useRef(0);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      const back = target.length - shown.current;
      if (back <= 0) {
        raf = 0;
        return;
      }
      shown.current = Math.min(target.length, shown.current + Math.max(1, Math.ceil(back / 16)));
      setN(shown.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, live]);

  if (!live) return target;
  return target.slice(0, Math.min(n, target.length));
}

function useElapsed(): string {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, []);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const KINDS: Record<TraceItem["kind"], { tag: string; bg: string; fg: string }> = {
  think: { tag: "think", bg: ROLE.utility, fg: "#fff" },
  read: { tag: "read", bg: ROLE.core, fg: "#fff" },
  list: { tag: "list", bg: ROLE.data, fg: "#fff" },
  search: { tag: "search", bg: ROLE.integration, fg: INK },
  write: { tag: "write", bg: ROLE.entry, fg: "#fff" },
};

const fromStages = (stages: Stage[]): TraceItem[] =>
  stages.map((s, i) => ({
    id: s.id,
    kind: "think",
    label: s.label,
    text: s.detail,
    done: i < stages.length - 1,
  }));

function Caret() {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[3px] translate-y-[0.2em] bg-neutral-950"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1, times: [0, 0.5, 0.5, 1], repeat: Infinity, ease: "linear" }}
    />
  );
}

function Sweep({ color, reduce }: { color: string; reduce: boolean }) {
  return (
    <span aria-hidden className="relative mt-3 block h-0.5 w-44 overflow-hidden bg-neutral-200">
      <motion.span
        className="absolute inset-y-0 left-0 w-1/3"
        style={{ background: color }}
        initial={{ x: "-100%" }}
        animate={reduce ? { x: "0%" } : { x: ["-100%", "300%"] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: EASE_STD }}
      />
    </span>
  );
}

function Row({ item, active, reduce }: { item: TraceItem; active: boolean; reduce: boolean }) {
  const k = KINDS[item.kind];
  const think = item.kind === "think";
  const shown = useSmoothText(item.text, active && !reduce);
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.row}
      className="relative pl-9"
    >
      <motion.span
        aria-hidden
        className="absolute left-0 top-[6px] size-[11px]"
        style={{ background: k.bg }}
        animate={active && !reduce ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={
          active ? { duration: 1.4, repeat: Infinity, ease: [0.4, 0, 0.2, 1] } : { duration: 0.2 }
        }
      />
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="shrink-0 px-1.5 py-[3px] text-[11px] font-semibold tracking-[0.02em]"
          style={{ background: k.bg, color: k.fg }}
        >
          {k.tag}
        </span>
        <span
          className={
            think
              ? "min-w-0 truncate text-[18px] font-semibold tracking-[-0.025em] text-neutral-950"
              : "min-w-0 truncate text-[13.5px] font-medium tracking-[-0.005em] text-neutral-950"
          }
        >
          {item.label}
        </span>
      </div>
      {item.text && (
        <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.65] tracking-[-0.012em] text-neutral-500 antialiased">
          {shown}
          {active && <Caret />}
        </p>
      )}
      {active && !item.text && <Sweep color={k.bg} reduce={reduce} />}
    </motion.li>
  );
}

export function ThinkingTrace({ items, stages }: { items: TraceItem[]; stages: Stage[] }) {
  const rows = items.length ? items : fromStages(stages);
  const { scroller, content, detached, jump } = useStickToBottom();
  const elapsed = useElapsed();
  const reduce = useReducedMotion() ?? false;
  const live = rows[rows.length - 1];

  return (
    <section aria-label="Model reasoning" className="mt-12 max-w-[56rem]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Pulse label={live ? live.label || "Working" : "Connecting"} />
        </div>
        <span className="t-mono shrink-0 tabular-nums text-neutral-500">{elapsed}</span>
      </div>

      <div className="relative">
        <div
          ref={scroller}
          role="log"
          aria-live="off"
          className="max-h-[min(58vh,560px)] overflow-y-auto overscroll-contain bg-neutral-100 px-6 pb-14 pt-10 [mask-image:linear-gradient(to_bottom,transparent,#000_32px,#000_calc(100%_-_48px),transparent)] [scrollbar-width:none] md:px-8"
        >
          <div ref={content} className="relative">
            <span aria-hidden className="absolute bottom-0 left-[5px] top-2 w-0.5 bg-neutral-200" />
            <ul className="relative space-y-7">
              {rows.map((r, i) => (
                <Row key={r.id} item={r} active={!r.done && i === rows.length - 1} reduce={reduce} />
              ))}
            </ul>
          </div>
        </div>

        <AnimatePresence>
          {detached && (
            <motion.div
              key="jump"
              className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={SPRING.row}
            >
              <Button onClick={jump} className="pointer-events-auto">
                <ArrowIcon className="rotate-90" />
                Jump to live
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
