<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## What this app is

The website for maskara, one Next.js deployment (Vercel Root Directory `web`). The product itself is the Python package at the repo root; nothing here masks data.

- `src/app/(site)/` is the landing page at maskara.dev, built from `src/components/site/`. It is the only page.
- `src/app/api/waitlist/` takes the landing page's team/on-prem waitlist signups and forwards each to `WAITLIST_WEBHOOK_URL`. It stores nothing, and it is the only thing the site collects.
- `public/demo/` is the showroom served at app.maskara.dev: static files written by `maskara ui --export web/public/demo` from the bundled synthetic sample data. Regenerate it with that command; don't edit it by hand.
- `src/proxy.ts` splits the hosts: the apex, www and any other host serve `/` and `/api/waitlist` and redirect the rest to `/`; `app.<domain>` (`app.localhost` in `pnpm dev`) serves the showroom at `/` and redirects the rest to the landing page.
- Settings are in `.env.example`.

Check changes with `pnpm lint` and `pnpm build`.
