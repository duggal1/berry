#!/usr/bin/env python3
"""Export the saved-analysis architecture canvas and playback source to Markdown."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "plans" / "architecture-frontend-source.md"
FILES = (
    "components/Workspace.tsx",
    "components/Stage.tsx",
    "sketch/Diagram.tsx",
    "components/Canvas.tsx",
    "components/ui.tsx",
    "lib/hooks.ts",
    "lib/timeline.ts",
    "lib/motion.ts",
    "lib/module-presentation.ts",
    "sketch/layout.ts",
    "sketch/rough.ts",
    "sketch/palette.ts",
    "lib/schema.ts",
)

LANGUAGES = {".tsx": "tsx", ".ts": "ts"}


def main() -> None:
    sections = [
        "# Saved-analysis architecture canvas and playback source\n",
        "Source files are listed in render and playback order. The landing page is excluded.\n",
    ]
    for name in FILES:
        path = ROOT / name
        source = path.read_text(encoding="utf-8")
        language = LANGUAGES.get(path.suffix, "text")
        sections.extend((f"## `{name}`\n", f"```{language}\n", source.rstrip(), "\n```\n"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(sections), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
