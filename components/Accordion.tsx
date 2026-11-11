import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_QUINT, EASE_STD, SPRING } from "@/lib/motion";

function Toggle({ open, reduce }: { open: boolean; reduce: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden
      className="shrink-0 text-neutral-950"
    >
      <path d="M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <motion.path
        d="M10 3v14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        animate={{ rotate: open ? 90 : 0, opacity: open ? 0 : 1 }}
        transition={reduce ? { duration: 0 } : SPRING.icon}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}

export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div
            key={it.q}
            className="bg-neutral-100 transition-colors duration-100 hover:bg-neutral-200/70"
          >
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-6"
            >
              <span className="text-[1.1rem] font-semibold leading-[1.35] tracking-tight">
                {it.q}
              </span>
              <Toggle open={on} reduce={reduce} />
            </button>
            <motion.div
              initial={false}
              animate={{ height: on ? "auto" : 0 }}
              transition={reduce ? { duration: 0 } : SPRING.faqHeight}
              className="overflow-hidden"
              inert={!on}
            >
              <motion.div
                initial={false}
                animate={{ opacity: on ? 1 : 0, y: on ? 0 : -6 }}
                transition={reduce ? { duration: 0 } : {
                  opacity: {
                    duration: on ? 0.42 : 0.14,
                    delay: on ? 0.08 : 0,
                    ease: on ? EASE_QUINT : EASE_STD,
                  },
                  y: SPRING.faqY,
                }}
                className="max-w-[40rem] px-5 pb-6 text-[17px] leading-[1.6] text-neutral-600 [text-wrap:pretty] md:px-6"
              >
                {it.a}
              </motion.div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
