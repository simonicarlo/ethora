# Start Session Flow — Design Spec

## Overview

Bridge the CouncilList → SessionView flow by adding a Material dialog that lets users enter a claim/question and start a deliberation session from any council card.

## Components

### StartSessionDialog

- **Type**: Standalone Angular component using `MAT_DIALOG_DATA` injection
- **Input data**: `Council` object (passed via `MatDialog.open()`)
- **Header**: Council name + agent count subtitle
- **Body**:
  - `mat-chip-set` showing agent names
  - `mat-form-field` with textarea for the claim/question (required)
  - Placeholder: "Enter a claim or question for the council to deliberate..."
- **Actions**: Cancel button + "Start Session" button (disabled until input non-empty)
- **Output**: Returns the `input_claim` string on close, or `undefined` if cancelled

### CouncilList Changes

- Add `mat-card-actions` with a "Start Session" button to each council card
- Button click opens `StartSessionDialog` with the council as data
- On dialog close with a result:
  1. Call `ApiService.createSession({ council_id: council.id, input_claim: result })`
  2. Navigate to `/sessions/${session.id}`

## Existing Infrastructure (no changes needed)

- `ApiService.createSession(data: SessionCreate)` — already implemented
- `SessionCreate` interface — `{ council_id: string; input_claim: string }`
- Route `/sessions/:id` → `SessionView` — already configured

## File Changes

| File | Action |
|------|--------|
| `frontend/src/app/features/session/start-session-dialog/start-session-dialog.ts` | Create — dialog component |
| `frontend/src/app/features/council/council-list/council-list.ts` | Edit — add button + dialog wiring |
