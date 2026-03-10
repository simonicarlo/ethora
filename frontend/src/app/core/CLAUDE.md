# Core Services — CLAUDE.md

## Purpose
Shared services and TypeScript type definitions used across all features.

## Files
- `api.service.ts` — HttpClient wrapper with typed methods for every API endpoint
- `sse.service.ts` — EventSource → RxJS Observable adapter with NgZone integration
- `models.ts` — TypeScript interfaces mirroring backend Pydantic schemas

## Key Design Choices
- **Centralized API calls**: All HTTP goes through `ApiService` — components never use `HttpClient` directly
- **Generic private methods**: `get<T>`, `post<T>`, `put<T>`, `delete<T>` reduce boilerplate
- **SSE event filtering**: `SseService.connect()` listens to specific named events, not `onmessage`
- **Zone integration**: SSE callbacks run inside `NgZone.run()` because EventSource fires outside Angular's zone
