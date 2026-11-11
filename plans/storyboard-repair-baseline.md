# Storyboard repair baseline

Captured from the local server cache snapshot for `duggal1/ai-job-software` at `cbc25b19270a875f104598f58875be7a4bdbfa29`. The record is preserved at `.data/cache/duggal1_ai-job-software~cbc25b19270a875f104598f58875be7a4bdbfa29.json` and was not edited.

This is not the browser's IndexedDB record from the supplied `#/r/...` screenshot. The browser database and live playback were not accessible here, so the exact screenshot playback position and IndexedDB payload remain unverified.

| Measure | Cached snapshot |
| --- | ---: |
| Displayed modules | 9 |
| Displayed graph edges | 10 |
| Flow steps | 7 |
| Modules mentioned by the flow | 7 |
| Unique flow edge IDs | 4 |
| Steps with a blank edge ID | 3 |
| Declared branches | 0 |
| Declared context-only modules | 0 |
| Modules omitted by the flow | `embedding-client`, `pinecone-search` |
| Edges not referenced by the flow | 6 |

The cached flow therefore reproduces the short single-path story defect. It ends after memo-cache and realtime-bus labels, omits the embedding and Pinecone modules, and cannot explain cache invalidation, SSE subscribers, client refetch, navigation, or the after-response failure boundary. The `auth-to-database` hop also conflates the authentication adapter with the job write; the pinned source places the job transaction in `saveJob`.

The local server cache and the browser's IndexedDB are separate stores. The implementation adds schema/generator provenance and a non-destructive reanalysis path, but this local server cache alone cannot prove what the screenshot's browser record contains.
