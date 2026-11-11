import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { SPRING } from "@/lib/motion";
import { INK, PALETTE, ROLE } from "@/sketch/palette";

export const wipe = (c: string) => ({ "--wipe": c }) as CSSProperties;

export function Chip({
  children,
  i = 0,
  color,
}: {
  children: ReactNode;
  i?: number;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-2 text-[14px] font-medium leading-none text-neutral-800">
      <span className="size-2" style={{ background: color ?? PALETTE[i % PALETTE.length] }} />
      {children}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "solid" | "quiet";
  accent?: string;
};

const ROLL = "transition-transform duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]";

export function Button({ tone = "solid", accent, className = "", children, ...rest }: BtnProps) {
  const solid = tone === "solid";
  return (
    <button
      type="button"
      style={wipe(accent ?? (solid ? ROLE.core : INK))}
      className={`btn group inline-flex h-11 shrink-0 items-center justify-center px-5 text-[16px] font-medium tracking-[-0.02em] disabled:pointer-events-none disabled:opacity-40 ${
        solid ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-950"
      } ${className}`}
      {...rest}
    >
      <span className="relative block overflow-hidden">
        <span
          className={`flex items-center gap-2 ${ROLL} group-hover:-translate-y-full group-focus-visible:-translate-y-full`}
        >
          {children}
        </span>
        <span
          aria-hidden
          className={`absolute inset-0 flex translate-y-full items-center gap-2 text-white ${ROLL} group-hover:translate-y-0 group-focus-visible:translate-y-0`}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

export function IconButton({
  label,
  dark = true,
  className = "",
  ...rest
}: HTMLMotionProps<"button"> & { label: string; dark?: boolean }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileHover={reduce ? undefined : { scale: 1.035 }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={SPRING.icon}
      style={wipe(dark ? ROLE.core : INK)}
      className={`btn grid size-11 shrink-0 place-items-center disabled:pointer-events-none disabled:opacity-30 ${
        dark
          ? "bg-neutral-950 text-white"
          : "bg-neutral-100 text-neutral-950 transition-colors delay-100 duration-200 hover:text-white"
      } ${className}`}
      {...rest}
    />
  );
}

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.25,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
} as const;

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 4v16l13-8z" fill="currentColor" stroke="none" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...base}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
export const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg {...base}>
    <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden
    className={`shrink-0 ${className}`}
  >
    <path d="M1.5 8h12.5M9 3.5 13.5 8 9 12.5" />
  </svg>
);

export const StopIcon = () => (
  <svg {...base}>
    <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />
  </svg>
);

export function Pulse({ label, tone }: { label: string; tone?: string }) {
  const reduce = useReducedMotion() ?? false;
  const colors = tone ? [tone] : [ROLE.entry, ROLE.core, ROLE.data];
  return (
    <p className="flex items-center gap-3 text-[15px] leading-none text-neutral-950" aria-live="polite">
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {colors.map((c, i) => (
          <motion.span
            key={c}
            className="size-2"
            style={{ background: c }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.28, 1, 0.28] }}
            transition={reduce ? { duration: 0 } : {
              duration: 1.6,
              repeat: Infinity,
              delay: i * 0.18,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
    </p>
  );
}

export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div role="radiogroup" className="relative inline-flex h-11 items-center bg-neutral-100 p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative h-9 px-4 text-[15px] font-medium tracking-[-0.02em] transition-colors duration-200 ${
              on ? "text-white" : "text-neutral-500 hover:text-neutral-950"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 bg-neutral-950"
                transition={reduce ? { duration: 0 } : SPRING.slide}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
