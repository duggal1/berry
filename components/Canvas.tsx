"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, ReactNode } from "react";

const MIN_K = 0.04;
const MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/**
 * A real canvas: the sketch keeps its natural size and the viewport pans, zooms and
 * fits. A large architecture opens zoomed out, whole, and readable from there instead
 * of being blown up past the edges of the page.
 */
export function Canvas({
  w,
  h,
  title,
  height = "min(62vh, 640px)",
  zoomOnWheel = false,
  toolbar,
  onBackgroundClick,
  children,
}: {
  w: number;
  h: number;
  title: string;
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
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [grabbing, setGrabbing] = useState(false);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    const k = clampK(Math.min(cw / w, ch / h) * 0.94);
    setView({ x: (cw - w * k) / 2, y: (ch - h * k) / 2, k });
  }, [w, h]);

  // Fit whenever a new sketch arrives (or the window changes shape) until the person
  // takes over the view.
  useLayoutEffect(() => {
    touched.current = false;
    fit();
  }, [fit]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!zoomOnWheel && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      touched.current = true;
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

  const zoomBy = (f: number) => {
    const el = box.current;
    if (!el) return;
    touched.current = true;
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

  function move(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  }

  function up(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setGrabbing(false);
    if (!d.moved) onBackgroundClick?.();
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
        if (e.key === "+" || e.key === "=") zoomBy(1.25);
        else if (e.key === "-") zoomBy(1 / 1.25);
        else if (e.key === "0") fit();
      }}
      className="relative w-full touch-none select-none overflow-hidden outline-none"
      style={{ height, cursor: grabbing ? "grabbing" : "grab" }}
    >
      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          width: w,
          height: h,
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`,
          transformOrigin: "0 0",
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
          onClick={() => zoomBy(1 / 1.3)}
          className="grid size-8 place-items-center text-[19px] leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            touched.current = false;
            fit();
          }}
          className="min-w-11 px-1 text-center text-[12px] font-medium tabular-nums text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Fit the whole sketch"
        >
          {Math.round(view.k * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.3)}
          className="grid size-8 place-items-center text-[19px] leading-none text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          +
        </button>
      </div>
    </div>
  );
}
