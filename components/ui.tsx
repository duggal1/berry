import type { ButtonHTMLAttributes, ReactNode } from "react";
import { PALETTE } from "@/sketch/palette";

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

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "solid" | "quiet" };

export function Button({ tone = "solid", className = "", ...rest }: BtnProps) {
  const look =
    tone === "solid"
      ? "bg-neutral-950 text-white hover:bg-neutral-700"
      : "bg-neutral-100 text-neutral-950 hover:bg-neutral-200";
  return (
    <button
      type="button"
      className={`inline-flex h-11 shrink-0 items-center justify-center px-5 text-[16px] font-medium tracking-tight transition-colors duration-100 disabled:opacity-40 ${look} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  dark = true,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; dark?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-11 shrink-0 place-items-center transition-colors duration-100 disabled:opacity-30 ${
        dark
          ? "bg-neutral-950 text-white hover:bg-neutral-700"
          : "bg-neutral-100 text-neutral-950 hover:bg-neutral-200"
      }`}
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
