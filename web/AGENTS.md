<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## What this app is

The website for maskara, one Next.js deployment (Vercel Root Directory `web`). The product itself is the Python package at the repo root; nothing here masks data.

- `src/app/(site)/` is the landing page at maskara.dev, built from `src/components/site/`.
- `src/app/(app)/` is the app at app.maskara.dev: a sidebar (`src/components/app-sidebar.tsx`) over one precomputed sample run, with Home, Datasets, Personas, Report, Benchmarks and Run locally. Screens are client components in `src/components/run/`; shadcn primitives are in `src/components/ui/` (Tailwind, `src/app/globals.css`, loaded only by this layout). Strings are in `src/lib/i18n/en.ts` and `ko.ts` (EN/KO toggle); add every string to both.
- The run comes from `public/demo/bundle.json` (schema `maskara.bundle/1`, see `src/maskara/ui/bundle.py`), written with the rest of `public/demo/` by `maskara ui --export web/public/demo` from the bundled synthetic sample data. Regenerate it with that command; don't edit it by hand. `src/lib/run-data.ts` (server-only) loads it and hands each page its slice; every app page is prerendered from it at build time, so nothing is processed server-side and nothing is uploaded. The landing page's sample values (`src/components/site/sample-data.ts`) come from that bundle too: rerun `node scripts/landing-sample.mjs` after re-exporting.
- `src/lib/bench/external.json` is a copy of `docs/assets/hero-external.json` (written by `python -m maskara.bench.hero --external`); copy it again after a new benchmark run. The linked-corpus numbers in `src/lib/bench/index.ts` come from `docs/research/bench-results.md`.
- `src/app/api/waitlist/` takes the landing page's team/on-prem waitlist signups and forwards each to `WAITLIST_WEBHOOK_URL`. It stores nothing, and it is the only thing the site collects.
- `src/proxy.ts` splits the hosts: the apex and www serve `/` and `/api/waitlist`, send app paths to the app host and the rest to `/`; `app.<domain>` (`app.localhost` in `pnpm dev`) serves the app paths, opens `/home` at `/`, and sends the rest to the landing page. Any other host (previews) serves both.
- Settings are in `.env.example`.

Check changes with `pnpm lint` and `pnpm build`.
