import type { Analysis, Module } from "@/lib/schema";
import { ROLE } from "@/sketch/palette";
import { ArrowIcon, Chip, CloseIcon, IconButton } from "./ui";

export function ModuleDetail({
  m,
  analysis,
  onClose,
}: {
  m: Module;
  analysis: Analysis;
  onClose: () => void;
}) {
  const name = (id: string) => analysis.modules.find((x) => x.id === id)?.name ?? id;
  const links = analysis.edges.filter((e) => e.from === m.id || e.to === m.id);
  return (
    <section className="mb-12 bg-neutral-100 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="t-h2">{m.name}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip color={ROLE[m.role]}>{m.role}</Chip>
            <Chip color="#0a0a0a">{m.kind}</Chip>
            {m.group && <Chip color="#6b7280">{m.group}</Chip>}
          </div>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <p className="t-body mt-5 max-w-[40rem] text-[1.2rem]">{m.purpose}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {m.files.length > 0 && (
          <div>
            <h3 className="text-[16px] font-semibold">Files</h3>
            <ul className="t-mono mt-3 space-y-1.5 text-[13px] text-neutral-600">
              {m.files.slice(0, 10).map((f) => (
                <li key={f}>{f}</li>
              ))}
              {m.files.length > 10 && <li className="text-neutral-400">and {m.files.length - 10} more</li>}
            </ul>
          </div>
        )}
        {links.length > 0 && (
          <div>
            <h3 className="text-[16px] font-semibold">Connections</h3>
            <ul className="mt-3 space-y-3 text-[15px] leading-[1.45] text-neutral-600">
              {links.map((e) => (
                <li key={e.id}>
                  <span className="font-medium text-neutral-950">
                    {name(e.from)}
                    <ArrowIcon size={13} className="mx-1 inline-block -translate-y-px" />
                    {name(e.to)}
                  </span>{" "}
                  ({e.label || e.kind}).{" "}
                  <span className="t-mono text-[12px]">
                    {e.inferred ? "inferred, backed by" : "found in"} {e.evidence.path}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
