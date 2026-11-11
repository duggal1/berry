import type { Route } from "@/lib/hooks";
import { PALETTE } from "@/sketch/palette";

export function Header({ route }: { route: Route }) {
  const home = route.name === "home";
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-white px-5 md:px-10">
      <a
        href="#/"
        className="flex items-center gap-3 text-[21px] font-bold tracking-tight"
        style={{ fontVariationSettings: '"wdth" 88' }}
      >
        <span className="flex gap-[3px]" aria-hidden>
          {PALETTE.slice(0, 4).map((c) => (
            <span key={c} className="size-2.5" style={{ background: c }} />
          ))}
        </span>
        Berry
      </a>
      <nav className="flex items-center gap-4">
        <a
          href="#/history"
          className={`t-mono text-[12px] uppercase tracking-[0.14em] transition-colors ${route.name === "history" ? "text-neutral-950" : "text-neutral-500 hover:text-neutral-950"}`}
        >
          History
        </a>
        <a
          href={home ? "#/example" : "#/"}
          className="inline-flex h-10 items-center bg-neutral-950 px-4 text-[15px] font-medium tracking-tight text-white transition-colors duration-100 hover:bg-neutral-700"
        >
          {home ? "Open the example" : "Explain a repo"}
        </a>
      </nav>
    </header>
  );
}
