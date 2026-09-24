<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tales Unwritten

A shared, AI-written gamebook. Every page is generated the first time a reader turns to it, then kept for everyone.

- `npm run dev` runs with the mock storyteller unless `GEMINI_API_KEY` is set (see `.env.example`).
- `npm run check` = typecheck + lint + unit tests. `npm run test:e2e` runs Playwright (mobile + desktop) against the mock.
- Engine: `src/lib/story/` (tree maths, prompts, schemas, `StoryService`). Pure logic lives in `tree.ts`; keep it pure.
- Models: `src/lib/ai/` behind the `StoryTeller` interface. Game rules (page numbers, endings, facts) are decided in code, never by the model.
- Storage: `src/lib/store/` behind `StoryStore`. `claimPage`/`completePage` must stay atomic in any new implementation.
- UI: `src/components/`, base styles in `src/app/globals.css`, one stylesheet per theme in `src/app/themes/`, scoped by `.desk[data-theme=…]`. Mobile first; respect `prefers-reduced-motion`.
- Sketches: hand-drawn SVGs in `public/sketches/` (200×200, stroke `#1b1206`, round caps, white fill only to hide lines behind), catalogued in `src/lib/sketches.ts`; the model picks one per page. Keep them black on white; themes recolour them.
- Themes: `src/lib/themes.ts` (voice, presets, UI wording). Theme CSS must also target `.desk.theme-sample[data-theme=…] .paper` so title-page tiles don't inherit the surrounding theme. Don't put `url(#…)` inside CSS custom properties.
