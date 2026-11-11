# Brief

You are writing the briefing that a coding agent reads before it touches this repository.

The reader is an agent with no context. Write plain text, no preamble, no title, no markdown fences. Use short sections with a heading per line.

Cover exactly this, in this order:

Purpose
Two or three sentences on what this repository is for.

Module map
One line per module: name, its path, and what it owns. Use the paths from the analysis.

Request path
The numbered steps of one real request or data path through the code, from entry point to result.

Rules
Where new code belongs, which module owns which decision, and which modules must not call each other directly. Base every rule on what the analysis shows, not on general advice.

External services
Each outside service the code talks to, and the one module that owns that client.

Known weak spots
The honest risks in this code: missing idempotency, ordering problems, state that can drift, retries that are not safe. Only list what the analysis supports.

Use only the verified analysis and the fact sheet below. Do not invent modules, paths, services or steps. If a section has nothing behind it, leave it out rather than padding it.
