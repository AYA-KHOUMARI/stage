# InventoMatch — Excel Inventory Reconciliation

A Next.js + MySQL application for reconciling a Mobilier inventory workbook with a Lecteur workbook.

## Important: no sheet name is hard-coded

The application **does not require `Feuil2`** (or any other specific sheet name).

For every uploaded workbook, it scans the workbook sheets and the first 50 rows of each sheet and automatically finds the sheet/header row containing the required columns.

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
5. If both are BT codes and equal → `Traité`.
6. If the machine is found but the BT differs (or is not a valid BT pair) → `Deplacé`.
7. If the machine is not found → `Non_Trouvé`.
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

## Login and password recovery

The first successful login creates an application user from the username, password, and recovery email submitted in the login form. Multiple accounts are supported. There are no hardcoded usernames or passwords. Password recovery sends a short-lived one-time code to the stored recovery email; knowing a username alone cannot reset a password.

Configure email before using **Mot de passe oublié ?** in production:

1. **Resend** (simplest for deployment): create an API key at [resend.com](https://resend.com), verify your domain, then set `RESEND_API_KEY` and `MAIL_FROM` in `.env.local`.
2. **SMTP**: Gmail (app password), [Brevo](https://www.brevo.com) (`smtp-relay.brevo.com`, free tier), or any SMTP provider — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`.

In local development without email configured, the 6-digit recovery code is printed in the terminal running `npm run dev`. Codes stay valid for 30 minutes.

An authenticated user can also change the password from the **Mot de passe** link in the dashboard.

After changing authentication environment variables, restart the Next.js server. For an existing database, run `npm run db:migrate` once.

If the MySQL container already exists, do not use `docker compose down -v` unless you intentionally want to delete the database volume.

## Performance et intégrité des gros fichiers

La route `POST /api/process` a été optimisée pour les fichiers volumineux :

- les feuilles sont inspectées uniquement sur leurs premières lignes lors de la détection des en-têtes ;
- les fichiers sont parsés une seule fois pour les données utiles ;
- la comparaison `Code Invest ↔ Barcode` est faite en mémoire avec une `Map`, en O(n), au lieu d'effectuer une requête MySQL pour chaque ligne ;
- le dernier scan par Barcode est sélectionné en mémoire selon `DateHeureEntree`, avec l'ordre d'import comme départage en cas d'égalité ;
- les insertions MySQL sont faites par lots de 2 000 lignes ;
- le résultat de chaque ligne Mobilier est enregistré dans `comparison_results` ;
- des contrôles d'intégrité vérifient que le nombre de lignes calculées, enregistrées et comparées est identique avant le `COMMIT` ;
- les lignes Mobilier non vides dont le `Code Invest` est vide ne sont plus supprimées silencieusement : elles restent dans le résultat avec `Non_Trouvé`.

Le fichier Excel final continue à être généré à partir des données MySQL et contient toutes les lignes du batch, pas seulement les 200 lignes de l'aperçu affiché dans l'interface.

## Status and bidirectional reconciliation

The reconciliation uses four statuses:

- `Traité`: machine exists in Mobilier and Lecteur, and the BT values match.
- `Deplacé`: machine exists in both files, but the BT values differ.
- `Non_Trouvé`: machine exists in Mobilier but is absent from Lecteur.
- `Nouveau`: machine exists in Lecteur but is absent from Mobilier. It is added to `inventory_items` so it appears in the final database and Excel result.

If the database was created before the `Nouveau` status was added, run once:

```bash
npm run db:migrate
```

This updates the existing MySQL ENUM values without deleting existing data.
