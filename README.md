# InventoMatch — Excel Inventory Reconciliation

A Next.js + MySQL application for reconciling a Mobilier inventory workbook with a Lecteur workbook.

### Mobilier file

Required columns:

- `BT INV2024`
- `Code Invest`

Optional columns are imported when present:

- `Désign. Affect.`
- `Direction`
- `Désignation`
- `Spécification`
- `Etat`

### Lecteur file

Required columns:

- `Barcode` (also accepts Code machine / Code barre aliases)
- `Etat`
- `Affect` (also accepts BT détecté / emplacement aliases)
- `DateHeureEntree` (also accepts DateHeure / Date lecture / Date aliases)

Column matching is tolerant of:

- upper/lower case
- accents (`État` / `Etat`)
- spaces and punctuation
- column order
- header row position (within the first 50 rows)
- sheet name changes (`Feuil1`, `Feuil2`, `Reforme`, custom names, etc.)

## Comparison logic

1. Normalize `Code Invest` and reader `Barcode` (trim + uppercase).
2. Match each inventory item to the **latest reader scan** for the same code.
3. Copy reader `Etat`, `Affect`, and `DateHeureEntree` into the result.
4. Compare `BT INV2024` with reader `Affect`.
5. If both are BT codes and equal → `DONE`.
6. If the machine is found but the BT differs (or is not a valid BT pair) → `DEPLACE`.
7. If the machine is not found → `NON_TROUVE`.
8. Duplicate reader barcodes are preserved in MySQL; the latest scan is used for the final reconciliation.

## Final Excel

The exported workbook keeps the main Mobilier fields and produces:

- `BT INV2024`
- `Désign. Affect.`
- `Direction`
- `Code Invest`
- `Désignation`
- `Spécification`
- `Etat` (reader state when found, otherwise original state)
- `EMPL Lecteur`
- `Date`
- `Statut`

The final rows are generated from a **real MySQL JOIN** between inventory items, reader scans, and comparison results.

## Run locally

```bash
npm install
cp .env.example .env.local
docker compose up -d
npm run dev
```

Open http://localhost:3000.

If the MySQL container already exists, do not use `docker compose down -v` unless you intentionally want to delete the database volume.
