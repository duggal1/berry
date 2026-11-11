import type { Edge, Module } from "@/lib/schema";

export const INK = "#0a0a0a";
export const STAGE_BG = "#f5f5f5";

/** Colour carries the role of a module. */
export const ROLE: Record<Module["role"], string> = {
  entry: "#ff5a1f",
  core: "#2a4bff",
  data: "#00a870",
  integration: "#f5a300",
  utility: "#8b5cf6",
  config: "#6b7280",
};

/** Colour carries the kind of a link. */
export const KIND: Record<Edge["kind"], string> = {
  call: "#0a0a0a",
  import: "#8a8a8a",
  data: "#00a870",
  event: "#e11d74",
};

export const PALETTE = Object.values(ROLE);
