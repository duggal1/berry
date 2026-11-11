# Berry

Berry turns a GitHub repository into an architecture sketch, a step-by-step request trace, and a prompt that gives a coding agent useful context about the codebase.

## What it does

- Draws modules and relationships found in a repository, with verified and inferred links distinguished.
- Traces a request through the architecture, one hop at a time.
- Generates an architecture-aware prompt and interview briefing.
- Lets you ask follow-up questions about an analysis.
- Keeps saved analyses in the browser using IndexedDB. A shared link uploads the analysis to the server, including evidence snippets.

Public repositories work without a GitHub token. Private repositories require a token with read access. The token is sent for that run and can optionally be remembered in this browser.

## Run locally

Requirements: [Bun](https://bun.sh/) 1.4.4 and Node.js compatible with Next.js 16.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. You can browse the example without configuring an AI provider.

To analyze repositories, configure the provider in `.env.local`:

```dotenv
REFLECTION_API_KEY=your_api_key
# Optional overrides:
# REFLECTION_BASE_URL=https://api.reflection.ai/openai/v1
# REFLECTION_MODEL=Beam-1.0-501B-A23B
# GITHUB_TOKEN=your_optional_server_token
```

Never commit API keys or repository tokens. `GITHUB_TOKEN` is optional for server-side GitHub access.

## Checks

```sh
bun run lint
bunx tsc --noEmit
bun run build
```

## Storage and sharing

Saved analyses use local IndexedDB. Server-side cache and shared analyses use files under `.data/` by default. This filesystem storage requires persistent disk and is **not durable on ephemeral/serverless hosts**. Do not rely on shared links surviving deployment or instance replacement unless persistent storage is configured.

Private-repository analyses may contain code excerpts. Check what is included before sharing a link. Anyone with the link can read its shared analysis.

## Design

Read [DESIGN.md](./DESIGN.md) before changing any interface code. The diagram uses fixed role colours, sketch strokes, square corners, no shadows or panel borders, and reduced-motion support. Keep desktop behaviour and styling intact when making the mobile layout responsive.
