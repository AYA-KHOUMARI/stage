"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  GitCompareArrows,
  Loader2,
  MapPin,
  MoveRight,
  PackageCheck,
  Search,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

type Status = "DONE" | "DEPLACE" | "NON_TROUVE";
type ResultRow = {
  btInv2024: string | null;
  designationAffect: string | null;
  direction: string | null;
  codeInvest: string;
  designation: string | null;
  specification: string | null;
  readerEtat: string | null;
  readerBt: string | null;
  readerDate: string | null;
  status: Status;
};
type ApiResult = {
  batchId: string;
  files: { mobilier: string; lecteur: string };
  total: number;
  readerRows: number;
  readerSheet: string;
  readerHeaderRow: number;
  counts: Record<Status, number>;
  rows: ResultRow[];
};

function DropZone({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`group relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-indigo-500 bg-indigo-50" : file ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      <div
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${file ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600"}`}
      >
        {file ? <CheckCircle2 size={28} /> : <UploadCloud size={28} />}
      </div>
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-1 max-w-[270px] text-sm text-slate-500">
        {file
          ? file.name
          : "Glissez votre fichier ici ou cliquez pour le sélectionner"}
      </p>
      {file && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFile(null);
          }}
          className="mt-3 text-xs font-semibold text-slate-500 hover:text-rose-600"
        >
          Retirer le fichier
        </button>
      )}
    </label>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles =
    status === "DONE"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "DEPLACE"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";
  const Icon =
    status === "DONE"
      ? CheckCircle2
      : status === "DEPLACE"
        ? MoveRight
        : XCircle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles}`}
    >
      <Icon size={13} />
      {status.replace("_", " ")}
    </span>
  );
}

export default function Home() {
  const [mobilier, setMobilier] = useState<File | null>(null);
  const [lecteur, setLecteur] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!result) return [];
    return result.rows.filter((r) => {
      const matchesStatus = filter === "ALL" || r.status === filter;
      const q = query.trim().toUpperCase();
      const matchesQuery =
        !q ||
        [
          r.codeInvest,
          r.btInv2024,
          r.readerBt,
          r.designation,
          r.direction,
        ].some((v) =>
          String(v || "")
            .toUpperCase()
            .includes(q),
        );
      return matchesStatus && matchesQuery;
    });
  }, [result, filter, query]);

  async function compare() {
    if (!mobilier || !lecteur) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("mobilier", mobilier);
      form.append("lecteur", lecteur);
      const response = await fetch("/api/process", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Impossible de traiter les fichiers.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    window.location.href = `/api/export?batchId=${encodeURIComponent(result.batchId)}`;
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg">
              <GitCompareArrows size={22} />
            </div>
            <div>
              <div className="text-lg font-black tracking-tight">
                InventoMatch
              </div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Inventory reconciliation
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid-bg relative overflow-hidden border-b border-slate-200/70">
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-14 lg:px-8 lg:pb-16 lg:pt-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
              <Database size={14} /> Colonnes détectées automatiquement
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Réconciliez votre inventaire en quelques secondes.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Importez vos deux fichiers Excel. La plateforme détecte
              automatiquement la feuille et les colonnes nécessaires, même si le
              nom de la feuille, l'ordre des colonnes ou la ligne d'en-tête
              changent.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <DropZone
            label="1. Fichier Mobilier"
            file={mobilier}
            onFile={setMobilier}
          />
          <DropZone
            label="2. Fichier Lecteur"
            file={lecteur}
            onFile={setLecteur}
          />
        </div>

        <div className="mt-6 flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center">
          <div>
            <p className="font-bold">Prêt pour la comparaison ?</p>
            <p className="mt-1 text-sm text-slate-500">
              Code Invest ↔ Barcode, puis BT INV2024 ↔ BT détecté.
            </p>
          </div>
          <button
            onClick={compare}
            disabled={!mobilier || !lecteur || loading}
            className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Traitement...
              </>
            ) : (
              <>
                <GitCompareArrows size={18} /> Comparer les fichiers
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-10 space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                  Résultat #{result.batchId.slice(0, 8)}
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Rapport de réconciliation
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {result.files.mobilier} · {result.files.lecteur} ·{" "}
                  {result.readerRows.toLocaleString("fr-FR")} lignes lues
                  automatiquement dans « {result.readerSheet} »
                </p>
              </div>
              <button
                onClick={download}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-indigo-700"
              >
                <Download size={17} /> Télécharger l'Excel final
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <PackageCheck className="text-indigo-600" size={21} />
                  <span className="text-xs font-bold text-slate-400">
                    TOTAL
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black">
                  {result.total.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-sm text-slate-500">articles Mobilier</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex items-center justify-between">
                  <CheckCircle2 className="text-emerald-600" size={21} />
                  <span className="text-xs font-bold text-emerald-700">
                    DONE
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black text-emerald-800">
                  {result.counts.DONE.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-sm text-emerald-700/80">même BT</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                <div className="flex items-center justify-between">
                  <MoveRight className="text-amber-600" size={21} />
                  <span className="text-xs font-bold text-amber-700">
                    DEPLACE
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black text-amber-800">
                  {result.counts.DEPLACE.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-sm text-amber-700/80">BT différent</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
                <div className="flex items-center justify-between">
                  <XCircle className="text-rose-600" size={21} />
                  <span className="text-xs font-bold text-rose-700">
                    NON TROUVÉ
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black text-rose-800">
                  {result.counts.NON_TROUVE.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-sm text-rose-700/80">
                  code absent du fichier Lecteur
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-black">Aperçu des résultats</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Les 200 premières lignes sont affichées. L'Excel contient
                    tout le résultat.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Rechercher un code..."
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-56"
                    />
                  </div>
                  <select
                    value={filter}
                    onChange={(e) =>
                      setFilter(e.target.value as "ALL" | Status)
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
                  >
                    <option value="ALL">Tous les statuts</option>
                    <option value="DONE">DONE</option>
                    <option value="DEPLACE">DEPLACE</option>
                    <option value="NON_TROUVE">NON TROUVÉ</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Code Invest</th>
                      <th className="px-5 py-3">BT original</th>
                      <th className="px-5 py-3">BT lecteur</th>
                      <th className="px-5 py-3">État lecteur</th>
                      <th className="px-5 py-3">Date lecteur</th>
                      <th className="px-5 py-3">Désignation</th>
                      <th className="px-5 py-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => (
                      <tr
                        key={`${row.codeInvest}-${row.readerDate}`}
                        className="hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-4 font-bold text-slate-900">
                          {row.codeInvest}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-600">
                          {row.btInv2024 || "—"}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-600">
                          {row.readerBt || "—"}
                        </td>
                        <td className="px-5 py-4">{row.readerEtat || "—"}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                          {row.readerDate
                            ? new Date(row.readerDate).toLocaleString("fr-FR")
                            : "—"}
                        </td>
                        <td className="max-w-[260px] truncate px-5 py-4 text-slate-600">
                          {row.designation || "—"}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-sm text-slate-500"
                        >
                          Aucun résultat pour ce filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="text-indigo-600" size={19} />
                  <p className="font-bold">Source Mobilier</p>
                </div>
                <p className="mt-3 break-all text-sm text-slate-500">
                  {result.files.mobilier}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <MapPin className="text-indigo-600" size={19} />
                  <p className="font-bold">Source lecteur</p>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Feuille détectée : {result.readerSheet} · ligne d'en-tête :{" "}
                  {result.readerHeaderRow}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <Database className="text-indigo-600" size={19} />
                  <p className="font-bold">Traitement</p>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Jointure SQL MySQL + export XLSX
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="border-t border-slate-200 bg-white"></footer>
    </main>
  );
}
