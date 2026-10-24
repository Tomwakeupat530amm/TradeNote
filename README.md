# TradeNote App (Frontend & Next.js Core)

This folder contains the Next.js 16.2.9 (Turbopack) web application for TradeNote.

## Available Scripts

In the `trade-note-app` directory, you can run:

### `npm run dev`
Runs the app in development mode with Turbopack.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm run build`
Builds the app for production to the `.next` folder.\
It correctly compiles all 13 localized routes and serverless API endpoints.

### `npm run start`
Starts a Next.js production server after `npm run build`.

### `npm run lint`
Runs ESLint across the codebase using `eslint.config.mjs`.

### `npm run test:api` / `npm run test:rls` / `npm run lint:sql`
AI Coach route contract (live cases need a dev server and a throwaway-user token, else SKIPPED), RLS two-user harness (SKIPPED without a TEST project), and SQL patch lint.

### `node scripts/test_enhancements_runner.mjs`
Runs the comprehensive unit testing suite (see `process/context/tests/all-tests.md` for measured totals):
- Prop firm risk engine & 1R bullet calculations
- Multi-asset position sizing (Futures point values, Forex pips, Crypto)
- High Water Mark trailing drawdown calculation
- WebP client-side canvas compression math
- Bilingual i18n key parity between `messages/en.json` and `messages/vi.json`
- Supabase explicit table grants & security policy compliance
- Interactive User Handbook & Guide contracts (100% app coverage)

## Key Folders & Modules

- `src/app/[locale]/` — Localized pages (Dashboard, Journal, Analytics, Accounts, Playbook, Calendar, Daily Review, Settings, Simulator)
- `src/components/` — Modular React components (Drawers, Modals, Heatmaps, Visual R:R Box, User Guide, Dropzones)
- `src/store/` — Zustand stores (`useAccountStore`, `useTradeStore`, `useAuthStore`, `useReviewStore`, `useSoundStore`, `useGuideStore`, `useLayoutStore`)
- `src/lib/` — Pure logic engines (`imageCompressor.ts`, `soundEngine.ts`, `supabase.ts`)
- `supabase/` — SQL home: `schema.snapshot.sql` (fresh install only), `patches/` (numbered upgrades + `.down.sql`), `probes/`, `legacy/`, `README.md`
- `messages/` — Bilingual localization dictionaries (`en.json`, `vi.json`)
- `scripts/` — Automated test runners and verification scripts

## Environment Variables

Ensure `.env.local` is created with:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

For complete project documentation, see the [Root README](../README.md) and [Process Context](../process/context/all-context.md).
