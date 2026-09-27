# Progressive Inventory — Multi-Lecteur Support

## Background

The current system treats every comparison as an independent **batch**: one Mobilier + one Lecteur → one result set. There is no continuity between comparisons.

The new model introduces an **Inventory Session**: the single Mobilier file is uploaded once to create a session, and any number of Lecteur files are added progressively. The merged inventory state is updated with every new Lecteur, so the process can be paused and resumed at any time.

**Core conceptual change:**

| Before | After |
|--------|-------|
| `Mobilier + Lecteur = Batch (one-shot)` | `Mobilier → one Session` |
| Result discarded after download | `Session + Lecteur 1 + Lecteur 2 + … = Complete Inventory` |

> [!IMPORTANT]
> There is **one Mobilier file** — the company's single master inventory. It is uploaded once at the start of the session and never needs to be uploaded again.

---

## Business Rules

| Rule | Decision |
|------|----------|
| Same barcode in two Lecteur files | **Latest scan date wins** |
| One session at a time per user | Yes — a user has **one active session**. Starting a new one does not delete the previous; the previous simply becomes inactive. |
| Logout behavior | Logging out ends only the **auth session**. The inventory session is persisted in the DB (linked to `user_id`) and can be resumed after re-login. |
| Old sessions | Kept indefinitely. |

---

## Proposed Changes

### 1. Database

#### [MODIFY] [schema.sql](file:///d:/Github%20Repos/stage/db/schema.sql)

**New table — `inventory_sessions`**
```sql
CREATE TABLE inventory_sessions (
  session_id        CHAR(36) NOT NULL,
  user_id           BIGINT UNSIGNED NOT NULL,   -- FK → app_users
  mobilier_filename VARCHAR(255) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_users(id)
);
```

**New table — `lecteur_batches`**
```sql
CREATE TABLE lecteur_batches (
  batch_id    CHAR(36) NOT NULL,
  session_id  CHAR(36) NOT NULL,               -- FK → inventory_sessions
  filename    VARCHAR(255) NOT NULL,
  reader_rows INT UNSIGNED NOT NULL DEFAULT 0,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  KEY idx_batches_session (session_id),
  CONSTRAINT fk_batch_session
    FOREIGN KEY (session_id) REFERENCES inventory_sessions(session_id)
);
```

**Modified table — `inventory_items`**
- Replace `batch_id` → `session_id` (FK → `inventory_sessions`).
- Add `last_lecteur_batch_id VARCHAR(36) NULL` — tracks which Lecteur most recently updated each item.

**Modified table — `reader_scans`**
- `batch_id` now references `lecteur_batches.batch_id` (semantics unchanged, FK target changes).

**Modified table — `comparison_results`**
- Replace `batch_id` → `session_id` (FK → `inventory_sessions`).

**Removed table — `imports`**
- Replaced entirely by `inventory_sessions` + `lecteur_batches`.

---

#### [NEW] [db/migrate-progressive.sql](file:///d:/Github%20Repos/stage/db/migrate-progressive.sql)
Migration script for existing deployments that already have the old schema:
- Creates the two new tables.
- Migrates existing `imports` rows into `inventory_sessions` + `lecteur_batches`.
- Renames FK columns on existing tables.
- Drops `imports`.

---

### 2. Business Logic

#### [MODIFY] [lib/reconcile.ts](file:///d:/Github%20Repos/stage/lib/reconcile.ts)

Add `mergeReconciliation()` alongside the existing `reconcile()` (which stays unchanged):

```ts
/**
 * Merges new reader scans into an existing reconciled inventory state.
 *
 * - Items whose codeInvest appears in the new Lecteur are re-evaluated.
 *   The latest scan date across all Lecteurs wins.
 * - Items not present in the new Lecteur are left unchanged.
 * - Barcodes in the new Lecteur with no matching codeInvest are added as Nouveau.
 */
export function mergeReconciliation(
  existing: ReconciledRow[],   // current state loaded from DB
  newScans: ReaderRow[]        // scans from the new Lecteur file
): ReconciledRow[]
```

**Merge logic (step by step):**
1. Build a map `newScanMap` keyed by normalized barcode → latest `ReaderRow` from this new Lecteur (by `dateHeureEntree`).
2. Track which codes were matched.
3. For each item in `existing`:
   - If `normalizeCode(item.codeInvest)` is in `newScanMap`:
     - Compare dates: if new scan is more recent than existing `readerDate` (or item was `Non_Trouvé`), update `readerEtat`, `readerBt`, `readerDate`, re-compute `status`.
     - Mark this barcode as matched.
   - Otherwise: copy item unchanged.
4. For each barcode in `newScanMap` that was not matched → append as `Nouveau`.

---

### 3. API Layer

#### [MODIFY] [app/api/process/route.ts](file:///d:/Github%20Repos/stage/app/api/process/route.ts)

`POST /api/process` operates in two modes based on the presence of `sessionId` in the form data.

**Mode 1 — New Session** (`sessionId` absent)
```
FormData: { mobilier: File, lecteur: File }

1. Parse Mobilier + Lecteur
2. reconcile() → initial result set
3. INSERT inventory_sessions (user_id from auth cookie)
4. INSERT lecteur_batches (batch 1)
5. INSERT inventory_items (keyed on session_id)
6. INSERT reader_scans
7. INSERT comparison_results
8. Return { sessionId, counts, rows, lecteurCount: 1, … }
```

**Mode 2 — Continue Session** (`sessionId` present)
```
FormData: { sessionId: string, lecteur: File }
No Mobilier file needed.

1. Verify session belongs to authenticated user
2. Load existing inventory_items from DB for this session
3. Parse new Lecteur → mergeReconciliation(existing, newScans)
4. UPDATE changed inventory_items (status, reader fields, last_lecteur_batch_id)
5. INSERT new Nouveau items
6. INSERT lecteur_batches (new batch record)
7. INSERT reader_scans (new batch's scans)
8. UPDATE/INSERT comparison_results for changed items
9. Return { sessionId, counts, rows, lecteurCount: N, … }
```

---

#### [NEW] [app/api/session/route.ts](file:///d:/Github%20Repos/stage/app/api/session/route.ts)

```
GET /api/session?sessionId=...
```

Returns the full current state of a session (used to restore UI on page reload or after re-login):

```json
{
  "sessionId": "...",
  "mobilierFilename": "Mobilier.xlsx",
  "lecteurBatches": [
    { "batchId": "...", "filename": "Lecteur_01.xlsx", "readerRows": 210, "importedAt": "..." },
    { "batchId": "...", "filename": "Lecteur_02.xlsx", "readerRows": 185, "importedAt": "..." }
  ],
  "total": 800,
  "counts": { "Traité": 420, "Deplacé": 35, "Non_Trouvé": 345, "Nouveau": 0 },
  "progressPct": 57,
  "rows": [ /* first 200 rows */ ]
}
```

---

#### [MODIFY] [app/api/export/route.ts](file:///d:/Github%20Repos/stage/app/api/export/route.ts)
- Switch query parameter from `batchId` to `sessionId`.
- Query now joins on `session_id`.

---

### 4. Frontend

#### [MODIFY] [app/page.tsx](file:///d:/Github%20Repos/stage/app/page.tsx)

**On page load:**
1. Read `sessionId` from `localStorage`.
2. If found → `GET /api/session?sessionId=...` → restore session state and enter Phase 2.
3. If not found → show Phase 1 (initial upload form).

---

**Phase 1 — Start Inventory** *(no active session)*

Two upload zones:
- **Mobilier.xlsx** (the company's reference inventory — uploaded once)
- **Lecteur_01.xlsx** (first batch of scans)

Button: **"Démarrer l'inventaire"**

---

**Phase 2 — Session Active** *(sessionId in state)*

A persistent **session banner** above the results:
```
┌─────────────────────────────────────────────────────┐
│ Inventaire en cours                                 │
│ Mobilier : Mobilier.xlsx     Session : a1b2c3…      │
│ Lecteurs traités : 2                                │
│                                                     │
│ Progression ████████░░░░░░░ 57%  420 / 800 items    │
│                                                     │
│  Traité  420   Deplacé  35   Non Trouvé  345        │
└─────────────────────────────────────────────────────┘
```

Below: one upload zone for the **next Lecteur** only (no Mobilier zone).

Button: **"Ajouter un Lecteur"**

The results table updates in place after each upload. Search and filter remain available.

---

**Phase 3 — Resume after Refresh / Re-login**

On page load, `sessionId` is read from `localStorage` and the session is fetched automatically. The UI resumes in Phase 2 with no re-upload required.

---

**Phase 4 — Finish**

Button: **"Terminer & Télécharger"** → `GET /api/export?sessionId=...` → downloads the complete Excel.

Button: **"Nouvelle session"** → clears `localStorage` sessionId, resets UI to Phase 1. The completed session remains in the DB unchanged.

---

## Verification Plan

### Build
```bash
npm run build
```

### Manual test sequence
1. Upload Mobilier + Lecteur 1 → session created, results shown (some items `Non_Trouvé`).
2. Upload Lecteur 2 → items in Lecteur 2 that were `Non_Trouvé` become `Traité`/`Deplacé`; others unchanged.
3. Reload the page → session restored automatically.
4. Log out → log back in → session resumes (sessionId in `localStorage` still valid).
5. Upload Lecteur 3 → cumulative counts update correctly.
6. Download final Excel → all rows from all Lecteurs present.
7. Click "Nouvelle session" → old session intact in DB; UI resets to Phase 1.
