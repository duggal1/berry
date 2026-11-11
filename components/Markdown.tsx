import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PALETTE, ROLE } from "@/sketch/palette";
import { wipe } from "./ui";

type Item = { text: string; sub: Block | null };
type Block =
  | { t: "h"; level: 1 | 2 | 3 | 4; text: string }
  | { t: "p"; lines: string[] }
  | { t: "code"; lang: string; body: string }
  | { t: "quote"; lines: string[] }
  | { t: "hr" }
  | { t: "list"; ordered: boolean; start: number; items: Item[] }
  | { t: "table"; head: string[]; rows: string[][] };

const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEAD = /^(#{1,4})\s+(.+?)\s*$/;
const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TSEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const starts = (l: string) =>
  FENCE_RE.test(l) || HEAD.test(l) || HR.test(l) || QUOTE.test(l) || LI.test(l);
const cells = (l: string) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function listAt(lines: string[], start: number, indent: number): [Block, number] {
  const first = LI.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const items: Item[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LI.exec(lines[i]);
    if (m) {
      const ind = m[1].length;
      if (ind < indent) break;
      if (ind > indent && items.length) {
        const [sub, next] = listAt(lines, i, ind);
        items[items.length - 1].sub = sub;
        i = next;
        continue;
      }
      items.push({ text: m[3], sub: null });
      i++;
      continue;
    }
    if (items.length && /^\s{2,}\S/.test(lines[i])) {
      items[items.length - 1].text += " " + lines[i].trim();
      i++;
      continue;
    }
    break;
  }
  return [{ t: "list", ordered, start: ordered ? parseInt(first[2], 10) : 1, items }, i];
}

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const f = FENCE_RE.exec(line);
    if (f) {
      const ch = f[1][0];
      const size = f[1].length;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.length >= size && [...t].every((c) => c === ch)) break;
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence, or run off the end while streaming
      out.push({ t: "code", lang: f[2], body: body.join("\n") });
      continue;
    }

    const h = HEAD.exec(line);
    if (h) {
      out.push({ t: "h", level: h[1].length as 1 | 2 | 3 | 4, text: h[2] });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const q: string[] = [];
      while (i < lines.length) {
        const m = QUOTE.exec(lines[i]);
        if (!m) break;
        q.push(m[1]);
        i++;
      }
      out.push({ t: "quote", lines: q });
      continue;
    }

    if (LI.test(line)) {
      const [b, next] = listAt(lines, i, LI.exec(line)![1].length);
      out.push(b);
      i = next;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TSEP.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push({ t: "table", head, rows });
      continue;
    }

    const p = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !starts(lines[i])) {
      p.push(lines[i]);
      i++;
    }
    out.push({ t: "p", lines: p });
  }
  return out;
}

/* inline */
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
const SAFE = /^(https?:\/\/|mailto:|#|\/)/i;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) {
      out.push(
        <code
          key={k}
          className="bg-neutral-200/70 px-1.5 py-px font-mono text-[0.84em] font-medium tracking-[-0.02em] text-neutral-950"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={k} className="font-semibold text-neutral-950">
          {inline(tok.slice(2, -2), k)}
        </strong>,
      );
    } else if (m[3]) {
      out.push(
        <del key={k} className="text-neutral-400">
          {inline(tok.slice(2, -2), k)}
        </del>,
      );
    } else if (m[4]) {
      out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    } else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (lm && SAFE.test(lm[2])) {
        out.push(
          <a
            key={k}
            href={lm[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-neutral-300 decoration-2 underline-offset-4 transition-colors hover:decoration-neutral-950"
          >
            {lm[1]}
          </a>,
        );
      } else out.push(lm ? lm[1] : tok);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {inline(l, `l${i}`)}
        </span>
      ))}
    </>
  );
}

function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <figure className="my-6 bg-neutral-950 text-neutral-100">
      <div className="flex items-center justify-between gap-4 px-5 pt-3.5">
        <span className="text-[12px] font-medium tracking-[0.04em] text-neutral-500">
          {lang || "text"}
        </span>
        <button
          type="button"
          onClick={copy}
          style={wipe(ROLE.core)}
          className="btn bg-neutral-800 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-neutral-100 transition-colors duration-100 hover:text-white"
        >
          {done ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 pb-5 pt-3 font-mono text-[13.5px] font-medium leading-[1.7] tracking-[-0.01em]">
        <code>{body}</code>
      </pre>
    </figure>
  );
}

function BlockView({ b, n = 0 }: { b: Block; n?: number }) {
  switch (b.t) {
    case "h":
      if (b.level === 1)
        return (
          <h1 className="mb-5 mt-12 text-[2.25rem] font-bold leading-[0.98] tracking-[-0.045em] text-neutral-950 first:mt-0 [font-variation-settings:'wdth'_80]">
            {inline(b.text)}
          </h1>
        );
      if (b.level === 2)
        return (
          <h2 className="mb-4 mt-12 flex items-center gap-3 text-[1.5rem] font-bold leading-[1.05] tracking-[-0.035em] text-neutral-950 first:mt-0 [font-variation-settings:'wdth'_84]">
            <span
              aria-hidden
              className="size-[0.5em] shrink-0"
              style={{ background: PALETTE[n % PALETTE.length] }}
            />
            {inline(b.text)}
          </h2>
        );
      if (b.level === 3)
        return (
          <h3 className="mb-2 mt-8 text-[1.2rem] font-semibold leading-[1.15] tracking-[-0.03em] text-neutral-950">
            {inline(b.text)}
          </h3>
        );
      return (
        <h4 className="mb-2 mt-6 text-[13px] font-semibold tracking-[0.02em] text-neutral-600">
          {inline(b.text)}
        </h4>
      );

    case "p":
      return (
        <p className="my-4 text-[17px] leading-[1.65] tracking-[-0.011em] text-neutral-700">
          <Lines lines={b.lines} />
        </p>
      );

    case "code":
      return <CodeBlock lang={b.lang} body={b.body} />;

    case "quote":
      return (
        <blockquote className="relative my-7 bg-neutral-50 py-4 pl-6 pr-5 text-[18px] leading-[1.6] tracking-[-0.015em] text-neutral-900">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{ background: ROLE.integration }}
          />
          <span
            aria-hidden
            className="absolute right-4 top-3 text-[22px] leading-none"
            style={{ color: ROLE.integration }}
          >
            &ldquo;
          </span>
          <Lines lines={b.lines} />
        </blockquote>
      );

    case "hr":
      return <hr className="my-10 h-0.5 border-0 bg-neutral-200" />;

    case "list":
      return (
        <ul className="my-4 space-y-2.5">
          {b.items.map((it, j) => (
            <li
              key={j}
              className="flex gap-3.5 text-[17px] leading-[1.6] tracking-[-0.011em] text-neutral-700"
            >
              {b.ordered ? (
                <span className="t-mono mt-1 w-6 shrink-0 tabular-nums text-neutral-400">
                  {String(b.start + j).padStart(2, "0")}
                </span>
              ) : (
                <span aria-hidden className="mt-[10px] size-[7px] shrink-0 bg-neutral-950" />
              )}
              <div className="min-w-0 flex-1">
                {inline(it.text, `li${j}`)}
                {it.sub && <BlockView b={it.sub} />}
              </div>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="my-6 overflow-x-auto">
          <table className="w-full border-separate text-left text-[15px] leading-[1.5] [border-spacing:2px]">
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap bg-neutral-950 px-4 py-3 text-[12px] font-semibold tracking-[0.02em] text-white"
                  >
                    {inline(h, `h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="bg-neutral-100 px-4 py-3 align-top text-neutral-700">
                      {inline(c, `c${i}${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parse(text), [text]);
  let h2 = 0;
  return (
    <div className="max-w-[46rem] antialiased [text-wrap:pretty]">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} n={b.t === "h" && b.level === 2 ? h2++ : 0} />
      ))}
    </div>
  );
});
