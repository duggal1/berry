"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, ReactNode } from "react";

const MIN_K = 0.04;
const MAX_K = 16;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export type FocusRegion = { x: number; y: number; w: number; h: number };

/**
 * A real canvas: the sketch keeps its natural size and the viewport pans, zooms and
 * fits. A large architecture opens zoomed out, whole, and readable from there instead
 * of being blown up past the edges of the page.
 */
export function Canvas({
  w,
  h,
  title,
  focusRegion,
  focusKey = 0,
  focusResetKey = 0,
  reducedMotion = false,
  height = "min(62vh, 640px)",
  zoomOnWheel = false,
  toolbar,
  onBackgroundClick,
  children,
}: {
  w: number;
  h: number;
  title: string;
  focusRegion?: FocusRegion | null;
  focusKey?: number;
  focusResetKey?: number;
  reducedMotion?: boolean;
  height?: string;
  zoomOnWheel?: boolean;
  toolbar?: ReactNode;
  onBackgroundClick?: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const touched = useRef(false);
  const lastFocusReset = useRef(focusResetKey);
  const panFrame = useRef(0);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [grabbing, setGrabbing] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [focusResumeKey, setFocusResumeKey] = useState(0);

  const fit = useCallback((showAll = false) => {
    const el = box.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    setAutoFocus(false);
    const fullScale = clampK(Math.min(cw / w, ch / h) * 0.97);
    // At phone widths, a full-graph fit can reduce text to unreadable pixels.
    // Start at a readable scale; the existing percent control still fits all.
    const k = !showAll && cw < 640 ? Math.max(fullScale, 0.55) : fullScale;
    setView({
      x: Math.max(16, (cw - w * k) / 2),
      y: Math.max(16, (ch - h * k) / 2),
      k,
    });
  }, [w, h]);

  // Fit whenever a new sketch arrives (or the window changes shape) until the person
  // takes over the view.
  useLayoutEffect(() => {
    touched.current = false;
    const el = box.current;
    if (el) setViewport({ width: el.clientWidth, height: el.clientHeight });
    fit();
  }, [fit]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport((current) => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        return current.width === next.width && current.height === next.height ? current : next;
      });
      if (!touched.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    if (lastFocusReset.current !== focusResetKey) {
      lastFocusReset.current = focusResetKey;
      touched.current = false;
    }
    if (!focusRegion || touched.current) return;
    const el = box.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    const padding = 56;
    const region = {
      x: Math.max(0, focusRegion.x - padding),
      y: Math.max(0, focusRegion.y - padding),
      w: Math.min(w, focusRegion.w + padding * 2),
      h: Math.min(h, focusRegion.h + padding * 2),
    };
    const k = clampK(Math.min(el.clientWidth / region.w, el.clientHeight / region.h) * 0.82);
    setView({
      x: el.clientWidth / 2 - (region.x + region.w / 2) * k,
      y: el.clientHeight / 2 - (region.y + region.h / 2) * k,
      k,
    });
    setAutoFocus(true);
  }, [focusKey, focusRegion, focusResetKey, focusResumeKey, h, w, viewport.width, viewport.height]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!zoomOnWheel && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      touched.current = true;
      setAutoFocus(false);
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0016));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomOnWheel]);

  useEffect(() => () => {
    if (panFrame.current) cancelAnimationFrame(panFrame.current);
  }, []);

  const zoomBy = (f: number) => {
    const el = box.current;
    if (!el) return;
    touched.current = true;
    setAutoFocus(false);
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const k = clampK(v.k * f);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  function down(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("g[role='button'], [data-canvas-ui]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.x, oy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGrabbing(true);
  }

  // Pointer events can arrive faster than the display refreshes. Apply at most
  // one compositor transform per animation frame instead of rerendering per event.
  function queuePan(x: number, y: number) {
    pendingPan.current = { x, y };
    if (panFrame.current) return;
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = 0;
      const next = pendingPan.current;
      pendingPan.current = null;
      if (next) setView((v) => ({ ...v, ...next }));
    });
  }

  function move(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) {
      touched.current = true;
      setAutoFocus(false);
      queuePan(d.ox + dx, d.oy + dy);
    }
  }

  function up(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (panFrame.current) cancelAnimationFrame(panFrame.current);
    panFrame.current = 0;
    const last = pendingPan.current;
    pendingPan.current = null;
    if (last) setView((v) => ({ ...v, ...last }));
    setGrabbing(false);
    if (!d.moved && e.type !== "pointercancel") onBackgroundClick?.();
  }

  return (
    <div
      ref={box}
      role="application"
      aria-label={`${title}. Drag to pan, zoom with the controls.`}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=") zoomBy(1.2);
        else if (e.key === "-") zoomBy(1 / 1.2);
        else if (e.key === "0") {
          touched.current = false;
          setFocusResumeKey((key) => key + 1);
          fit(true);
        }
      }}
      className="relative w-full touch-pan-y select-none overflow-hidden outline-none md:touch-none"
      style={{ height, cursor: grabbing ? "grabbing" : "grab" }}
    >
      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          width: w,
          height: h,
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`,
          transformOrigin: "0 0",
          transition: autoFocus && !reducedMotion ? "transform 240ms ease-out" : "none",
        }}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={title}
          className="block select-none"
        >
          {children}
        </svg>
      </div>

      {toolbar && (
        <div data-canvas-ui className="absolute left-4 top-4 z-10 md:left-6 md:top-5">
          {toolbar}
        </div>
      )}

      <div
        data-canvas-ui
        className="absolute bottom-4 right-4 z-10 flex items-center gap-0.5 bg-white/90 px-1 py-1 backdrop-blur-[2px] md:bottom-5 md:right-6"
      >
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
          className="grid size-11 place-items-center text-[19px] md:size-8 leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            touched.current = false;
            setFocusResumeKey((key) => key + 1);
            setAutoFocus(false);
            fit(true);
          }}
          className="min-w-11 px-1 text-center text-[12px] font-medium tabular-nums text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Fit the whole sketch"
        >
          {Math.round(view.k * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.2)}
          className="grid size-11 place-items-center text-[19px] md:size-8 leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          +
        </button>
      </div>
    </div>
  );
}
