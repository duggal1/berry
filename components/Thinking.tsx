import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Stage } from "@/lib/schema";
import { EASE_QUINT } from "@/lib/motion";
import { INK, PALETTE } from "@/sketch/palette";
import { arrowPaths, polyPaths, rectPaths } from "@/sketch/rough";
import { Button } from "./ui";

const W = 192;
const H = 72;
const GAP = 72;
const fit = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function Dots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  );
}

function StageBox({
  s,
  i,
  active,
  reduce,
}: {
  s: Stage;
  i: number;
  active: boolean;
  reduce: boolean;
}) {
  const color = PALETTE[i % PALETTE.length];
  const paths = useMemo(() => rectPaths(`stage:${s.id}`, W, H, color), [s.id, color]);
  const x = i * (W + GAP);
  const y = 12;
  const link = useMemo(
    () => (i === 0 ? [] : polyPaths(`link:${s.id}`, [[x - GAP, y + H / 2], [x - 4, y + H / 2]])),
    [i, s.id, x],
  );
  const head = useMemo(
    () => (i === 0 ? [] : arrowPaths(`link:${s.id}`, [x - GAP, y + H / 2], [x - 2, y + H / 2])),
    [i, s.id, x],
  );
  return (
    <g>
      {[...link, ...head].map((p, k) => (
        <motion.path
          key={k}
          d={p.d}
          fill="none"
          stroke={INK}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: EASE_QUINT }}
        />
      ))}
      <g transform={`translate(${x} ${y})`}>
        <motion.rect
          width={W}
          height={H}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ opacity: active ? 0.3 : 0.12 }}
          transition={{ duration: 0.3 }}
        />
        {paths.map((p, k) =>
          p.hatch ? (
            <motion.path
              key={k}
              d={p.d}
              fill="none"
              stroke={color}
              strokeWidth={0.9}
              initial={{ opacity: 0 }}
              animate={{ opacity: active ? 0.9 : 0.4 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            />
          ) : (
            <motion.path
              key={k}
              d={p.d}
              fill="none"
              stroke={INK}
              strokeWidth={active ? 2.25 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.48, ease: EASE_QUINT }}
            />
          ),
        )}
        <text
          x={16}
          y={32}
          fontSize={16}
          fontWeight={600}
          fill={INK}
          style={{ letterSpacing: "-0.02em" }}
        >
          {fit(s.label, 20)}
        </text>
        <text x={16} y={54} className="font-mono" fontSize={11} fill="#6b6b6b">
          {fit(s.detail, 24)}
        </text>
        {active && (
          <motion.circle
            cy={0}
            r={5}
            fill={INK}
            initial={{ cx: 0 }}
            animate={{ cx: reduce ? 0 : W }}
            transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: EASE_QUINT }}
          />
        )}
      </g>
    </g>
  );
}

export function Thinking(props: {
  stages: Stage[];
  status: "running" | "done" | "error";
  error: string;
  compact: boolean;
  count: number;
  onRetry: () => void;
}) {
  const { stages, status, error, compact } = props;
  const reduce = useReducedMotion() ?? false;
  const n = Math.max(stages.length, 1);
  const width = n * W + (n - 1) * GAP + 8;
  const last = stages[stages.length - 1];

  if (compact)
    return (
      <div className="mx-auto max-w-[1680px] px-5 pt-24 md:px-10 md:pt-28">
        <p className="t-mono flex items-center gap-3 text-[13px] text-neutral-600" aria-live="polite">
          {status === "running" ? (
            <>
              <Dots /> writing the coding prompt
            </>
          ) : (
            <>
              <span className="size-2 bg-neutral-950" /> done · {props.count} modules · saved to this
              browser
            </>
          )}
        </p>
      </div>
    );

  return (
    <section className="mx-auto w-full max-w-[1680px] px-5 pb-10 pt-32 md:px-10 md:pt-36">
      <h1 className="t-h1 max-w-[14ch]">
        {status === "error" ? "That run stopped." : "The model is reading your repo."}
      </h1>
      <p className="t-lead mt-5 max-w-[36rem]" aria-live="polite">
        {status === "error" ? error : last?.detail || "Connecting to the server."}
      </p>
      {status === "error" ? (
        <div className="mt-8 flex gap-3">
          <Button onClick={props.onRetry}>Try again</Button>
          <a
            href="#/"
            className="inline-flex h-11 items-center bg-neutral-100 px-5 text-[16px] font-medium tracking-tight transition-colors duration-100 hover:bg-neutral-200"
          >
            Back
          </a>
        </div>
      ) : (
        <>
          <div className="mt-12 overflow-x-auto">
            <svg
              role="img"
              aria-label={`Run progress: ${stages.map((s) => s.label).join(", ") || "connecting"}`}
              viewBox={`0 0 ${width} ${H + 24}`}
              style={{ width: Math.max(width, 320), height: H + 24 }}
              className="block"
            >
              {stages.map((s, i) => (
                <StageBox key={s.id} s={s} i={i} active={i === stages.length - 1} reduce={reduce} />
              ))}
              {stages.length === 0 && (
                <StageBox s={{ id: "connect", label: "Connecting", detail: "" }} i={0} active reduce={reduce} />
              )}
            </svg>
          </div>
          <p className="t-mono mt-8 flex items-center gap-3 text-[13px] text-neutral-600">
            <Dots /> model is thinking
          </p>
        </>
      )}
    </section>
  );
}
