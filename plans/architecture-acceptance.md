# Architecture accuracy acceptance plan

This is a verification checklist for Berry's repository-to-sketch pipeline. It is not a substitute for tests or a claim that the model has passed.

## Reference repository: Jupiter

Use `duggal1/Jupiter`, specifically the `Purge` Swift source tree, to validate behavior after graph changes. Pin the tested commit SHA and regenerate the analysis rather than reusing an older browser-saved sketch.

Known source-level relationships to check:

| Source | Target | Source evidence to inspect | Classification |
| --- | --- | --- | --- |
| `Purge/PurgeApp.swift` | `Purge/Views/ShellView.swift` | `ShellView()` inside `JupiterApp` | Constructor use; inferred without typechecking |
| `Purge/PurgeApp.swift` | `Purge/Scanner/WatchdogRunner.swift` | `WatchdogRunner.runAndExit()` | Static call; inferred without typechecking |
| `Purge/Scanner/WatchdogRunner.swift` | `Purge/Scanner/Scanner.swift` | `Scanner.scanWatchdog(config: cfg, hasFDA: hasFDA)` | Static call; inferred without typechecking |
| `Purge/Scanner/WatchdogRunner.swift` | `Purge/Scanner/Cleaner.swift` | `Cleaner.clean(items: toClean)` | Static call; inferred without typechecking |
| `Purge/Scanner/Scanner.swift` | `Purge/Models/Junk.swift` | Return and parameter types such as `ScannedItem` | Type dependency; not a runtime call |

Do not assume these are the only relationships. Confirm against the exact requested commit. If a line changed, look up its current evidence instead of using the table as fabricated output.

## Automated acceptance

- Each diagram edge has existing endpoints and a single-line excerpt from a real source file.
- Each edge's source module owns the cited source file where an owner is known.
- A type annotation must not be rendered or described as a runtime function call.
- Static Swift calls with uniquely declared target types are recovered but remain flagged inferred.
- A graph with mostly isolated modules triggers one bounded agent repair pass, never infinite retries.
- The browser never treats a truncated SSE stream as complete.
- Source-list tools can paginate beyond 250 files; source reads are bounded to 300 lines.
- Cache versions change when graph semantics change, so an unchanged repository can be reassessed.

## Visual acceptance

At wide desktop widths, preserve the current font, role colors, sketch stroke, square corners, tab layout, and stage framing. Do not trade semantic accuracy for prettier arrows. On iOS-sized viewports, preserve vertical page scroll, make zoom targets at least 44 CSS pixels, and provide a readable starting scale. Reduced-motion mode must remain fully usable without decorative transitions.

## End-to-end checks

1. Analyze a pinned Jupiter commit with a configured provider.
2. Inspect `read_file` tool calls and source citations. Verify no paths or snippets were invented.
3. Compare the drawn edges with the corresponding source lines. Record missing, incorrect, inferred and verified links separately.
4. Verify the pen's path follows real directed edges, not unrelated adjacent modules.
5. Inspect 375px, 430px, 768px and desktop widths. Repeat with reduced-motion enabled.
6. Refresh the result and re-open its browser-saved copy. Confirm the full agent brief persisted.
7. Record failures with the commit SHA and minimal reproducible repository fixture before changing heuristics.
