# Testing (Hospital ERP)

This project is **Express + TypeScript** (API), **Vite + React** (UI), **PostgreSQL** — not Next.js. Tests use **Vitest** as the single runner for Node (server/business) and **jsdom** (React).

## Commands

```bash
# Install dev tooling (once, after pulling package.json changes)
npm install

# Default: unit / offline tests (no running API server required)
npm run test

# All Vitest tests including HTTP integration against localhost:5000
# (start the app first: npm run dev, in another terminal:)
npm run test:live-api

# Watch mode (local)
npm run test:watch

# Coverage report (HTML in coverage/)
npm run test:coverage
```

## Layout

| Path | Purpose |
|------|---------|
| `tests/**/*.test.ts` | Node: API integration (live server), business logic, utilities |
| `client/src/**/*.test.{ts,tsx}` | Client: components/hooks (jsdom for `.tsx` / `*.rtl.test.*`) |
| `tests/setup/vitest.setup.ts` | Global setup (e.g. `@testing-library/jest-dom`) |
| `client/src/test-utils/` | Shared `renderWithProviders` (grow in Phase 3) |

## Environment

- Copy [`.env.test.example`](../.env.test.example) to `.env.test` if you introduce DB-backed tests.
- **Never commit** real admin or production passwords. Use dedicated test users in CI.

## Notes

- HTTP integration tests are **skipped by default** (see `liveHttpTestFiles` in [vitest.config.ts](../vitest.config.ts)). Set `VITEST_LIVE_API=1` via `npm run test:live-api` with **`npm run dev`** running so `http://localhost:5000` is reachable.
