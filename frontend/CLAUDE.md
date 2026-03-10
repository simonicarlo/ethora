# Frontend — CLAUDE.md

## Overview
Angular 21 SPA for the Agent Council UI. Uses standalone components, Signals, and Angular Material.

## Structure
- `src/app/core/` — Shared services (API, SSE) and TypeScript interfaces
- `src/app/features/` — Feature modules (home, council, session)
- `src/app/app.config.ts` — Standalone bootstrap with providers
- `src/app/app.routes.ts` — Lazy-loaded routes

## Key Design Choices
- **Standalone only**: No NgModules — all components use `imports` array directly
- **Signals for state**: `signal()`, `computed()`, `input()`, `output()` — no NgRx
- **Lazy loading**: All feature routes use `loadComponent()` for code splitting
- **Zone-aware SSE**: `SseService` wraps EventSource callbacks in `NgZone.run()` for change detection
- **Proxy in dev**: `/api` requests proxy to `localhost:8000` via `proxy.conf.json`

## Testing
- Test runner: Vitest (via `@angular/build:unit-test`)
- Config: `tsconfig.spec.json` includes `vitest/globals` types
- Run: `ng test`
- Pattern: `*.spec.ts` alongside source files

## Conventions
- `input.required()` for mandatory component inputs
- `output()` for event emitters
- `computed()` for derived state
- Angular Material for all UI components
