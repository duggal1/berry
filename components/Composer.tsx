import { useLayoutEffect, useRef } from "react";
import type { FormEvent } from "react";
import { ArrowIcon, IconButton, StopIcon } from "./ui";

export function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const { value, onChange, onSend, onStop, busy } = props;
  const ta = useRef<HTMLTextAreaElement>(null);
  const ready = value.trim().length > 0 && !busy;

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSend();
  }

  return (
    <form onSubmit={submit} className="mt-10">
      <div className="bg-neutral-100 transition-colors duration-150 focus-within:bg-neutral-200/70">
        <textarea
          ref={ta}
          value={value}
          rows={1}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (ready) onSend();
            }
          }}
          placeholder="Ask me anything"
          aria-label="Ask about this repo"
          className="block min-h-[88px] w-full resize-none bg-transparent px-6 pb-2 pt-5 text-[19px] leading-[1.45] tracking-[-0.015em] text-neutral-950 outline-none placeholder:text-neutral-500"
        />
        <div className="flex items-center justify-between gap-4 px-4 pb-3">
          <span className="text-[12px] tracking-[-0.01em] text-neutral-400">
            {busy ? "streaming answer" : "enter to send · shift+enter for a new line"}
          </span>
          {busy ? (
            <IconButton label="Stop" onClick={onStop}>
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton label="Send" type="submit" disabled={!ready}>
              <ArrowIcon className="-rotate-90" />
            </IconButton>
          )}
        </div>
      </div>
    </form>
  );
}