"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  GitCompareArrows,
  Layers,
  Loader2,
  LogOut,
  MapPin,
  MoveRight,
  PackageCheck,
  PlusCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  UploadCloud,
  XCircle,
  KeyRound,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "Traité" | "Deplacé" | "Non_Trouvé" | "Nouveau";

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

type LecteurBatch = {
  batchId: string;
  filename: string;
  readerRows: number;
  importedAt: string;
};

type SessionState = {
  sessionId: string;
  mobilierFilename: string;
  lecteurBatches: LecteurBatch[];
  lecteurCount: number;
  total: number;
  counts: Record<Status, number>;
  progressPct: number;
  rows: ResultRow[];
};

// ─── Local Storage key ────────────────────────────────────────────────────────
const SESSION_STORAGE_KEY = "inventomatch_session_id";

// ─── Sub-components ───────────────────────────────────────────────────────────

function DropZone({
  label,
  file,
  onFile,
  accept = ".xlsx,.xls",
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  accept?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`group relative flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
        dragging
          ? "border-indigo-500 bg-indigo-50"
          : file
            ? "border-emerald-300 bg-emerald-50/60"
            : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
      }`}
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
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      <div
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
          file
            ? "bg-emerald-100 text-emerald-600"
            : "bg-indigo-100 text-indigo-600"
        }`}
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
    status === "Traité"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "Deplacé"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "Nouveau"
          ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";
  const Icon =
    status === "Traité"
      ? CheckCircle2
      : status === "Deplacé"
        ? MoveRight
        : status === "Nouveau"
          ? Database
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

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  // Phase 1 state
  const [mobilier, setMobilier] = useState<File | null>(null);
  const [lecteur, setLecteur] = useState<File | null>(null);

  // Session state (phases 2–4)
  const [session, setSession] = useState<SessionState | null>(null);
  const [nextLecteur, setNextLecteur] = useState<File | null>(null);

  // Shared UI state
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [query, setQuery] = useState("");

  // ── Restore session on mount ─────────────────────────────────────────────
  useEffect(() => {
    const savedId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedId) {
      setRestoring(false);
      return;
    }
    fetch(`/api/session?sessionId=${encodeURIComponent(savedId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) {
          setSession(data as SessionState);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      })
      .catch(() => localStorage.removeItem(SESSION_STORAGE_KEY))
      .finally(() => setRestoring(false));
  }, []);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!session) return [];
    return session.rows.filter((r) => {
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
  }, [session, filter, query]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function applyResult(data: any) {
    const newSession: SessionState = {
      sessionId: data.sessionId,
      mobilierFilename: data.mobilierFilename,
      lecteurBatches: data.lecteurBatches ?? [],
      lecteurCount: data.lecteurCount ?? 1,
      total: data.total,
      counts: data.counts,
      progressPct:
        data.progressPct ??
        Math.round(
          ((data.counts.Traité + data.counts.Deplacé + data.counts.Nouveau) /
            data.total) *
            100,
        ),
      rows: data.rows,
    };
    setSession(newSession);
    localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
  }

  // ── Phase 1 — Start a new session ────────────────────────────────────────
  async function startSession() {
    if (!mobilier || !lecteur) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("mobilier", mobilier);
      form.append("lecteur", lecteur);
      const res = await fetch("/api/process", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Impossible de traiter les fichiers.");
      applyResult(data);
      setMobilier(null);
      setLecteur(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  // ── Phase 2 — Add a Lecteur to the active session ─────────────────────────
  async function addLecteur() {
    if (!nextLecteur || !session) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("sessionId", session.sessionId);
      form.append("lecteur", nextLecteur);
      const res = await fetch("/api/process", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Impossible de traiter le fichier.");

      // Re-fetch the full session to get the updated lecteur batch list.
      const sessionRes = await fetch(
        `/api/session?sessionId=${encodeURIComponent(session.sessionId)}`,
      );
      const sessionData = await sessionRes.json();
      if (sessionRes.ok) {
        applyResult(sessionData);
      } else {
        applyResult(data);
      }
      setNextLecteur(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  // ── Phase 4 — Download final Excel ───────────────────────────────────────
  function download() {
    if (!session) return;
    window.location.href = `/api/export?sessionId=${encodeURIComponent(session.sessionId)}`;
  }

  // ── New session ───────────────────────────────────────────────────────────
  function newSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setNextLecteur(null);
    setFilter("ALL");
    setQuery("");
    setError("");
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // ── Loading skeleton while restoring session ──────────────────────────────
  if (restoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc]">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      {/* ── Header ────────────────────────────────────────────────────────── */}
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
                Réconciliation de l'inventaire
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <button
                onClick={newSession}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <RefreshCcw size={16} /> Nouvelle session
              </button>
            )}
            <a
              href="/change-password"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <KeyRound size={16} /> Mot de passe
            </a>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut size={16} /> Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {!session && (
        <section className="grid-bg relative overflow-hidden border-b border-slate-200/70">
          <div className="mx-auto max-w-7xl px-5 pb-12 pt-14 lg:px-8 lg:pb-16 lg:pt-20">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                <Database size={14} /> Colonnes détectées automatiquement
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                Réconciliez votre inventaire en plusieurs sessions.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Importez le Mobilier une seule fois. Ajoutez autant de fichiers
                Lecteur que nécessaire au fil de la journée — les résultats se
                cumulent sans jamais repartir de zéro.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        {/* ════════════════════════════════════════════════════════════════
            PHASE 1 — No active session: upload Mobilier + first Lecteur
        ════════════════════════════════════════════════════════════════ */}
        {!session && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <DropZone
                label="1. Fichier Mobilier"
                file={mobilier}
                onFile={setMobilier}
              />
              <DropZone
                label="2. Premier Lecteur"
                file={lecteur}
                onFile={setLecteur}
              />
            </div>

            <div className="mt-6 flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center">
              <div>
                <p className="font-bold">Démarrer l'inventaire</p>
                <p className="mt-1 text-sm text-slate-500">
                  Le Mobilier est chargé une seule fois. Vous pourrez ajouter
                  d'autres Lecteurs ensuite.
                </p>
              </div>
              <button
                onClick={startSession}
                disabled={!mobilier || !lecteur || loading}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Traitement...
                  </>
                ) : (
                  <>
                    <GitCompareArrows size={18} /> Démarrer l'inventaire
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PHASES 2–4 — Active session
        ════════════════════════════════════════════════════════════════ */}
        {session && (
          <div className="space-y-6">
            {/* ── Session Banner ─────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-soft">
              <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:gap-8">
                {/* Left: session info */}
                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                      <Layers size={13} /> Inventaire en cours
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">
                        Mobilier
                      </p>
                      <p className="mt-0.5 font-bold text-slate-800 truncate">
                        {session.mobilierFilename}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">
                        Lecteurs traités
                      </p>
                      <p className="mt-0.5 text-2xl font-black text-indigo-700">
                        {session.lecteurCount}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">
                        Éléments couverts
                      </p>
                      <p className="mt-0.5 font-bold text-slate-800">
                        {(
                          session.counts.Traité +
                          session.counts.Deplacé +
                          session.counts.Nouveau
                        ).toLocaleString("fr-FR")}
                        <span className="font-normal text-slate-400">
                          {" "}
                          / {session.total.toLocaleString("fr-FR")}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">
                        Progression
                      </p>
                      <p className="mt-0.5 text-2xl font-black text-emerald-600">
                        {session.progressPct}%
                      </p>
                    </div>
                  </div>

                  <ProgressBar pct={session.progressPct} />

                  {/* Counts row */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(
                      [
                        { key: "Traité", label: "Traité", color: "emerald" },
                        { key: "Deplacé", label: "Déplacé", color: "amber" },
                        {
                          key: "Non_Trouvé",
                          label: "Non Trouvé",
                          color: "rose",
                        },
                        { key: "Nouveau", label: "Nouveau", color: "indigo" },
                      ] as const
                    ).map(({ key, label, color }) => (
                      <div
                        key={key}
                        className={`rounded-xl border p-3 border-${color}-200 bg-${color}-50/60`}
                      >
                        <p className={`text-xs font-bold text-${color}-700`}>
                          {label}
                        </p>
                        <p className={`text-xl font-black text-${color}-800`}>
                          {session.counts[key as Status].toLocaleString(
                            "fr-FR",
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: lecteur batch history */}
                {session.lecteurBatches &&
                  session.lecteurBatches.length > 0 && (
                    <div className="w-full lg:w-72 shrink-0">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                        Historique des Lecteurs
                      </p>
                      <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {session.lecteurBatches.map((b, i) => (
                          <li
                            key={b.batchId}
                            className="flex items-start gap-2 rounded-xl bg-white border border-slate-100 p-3 text-sm shadow-sm"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800">
                                {b.filename}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>

            {/* ── Add next Lecteur ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
              <p className="mb-4 font-bold text-slate-900">
                Ajouter un nouveau Lecteur
              </p>
              <DropZone
                label="Fichier Lecteur suivant"
                file={nextLecteur}
                onFile={setNextLecteur}
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <p className="text-sm text-slate-500">
                  Le fichier Mobilier n'a pas besoin d'être re-uploadé.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={addLecteur}
                    disabled={!nextLecteur || loading}
                    className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />{" "}
                        Traitement...
                      </>
                    ) : (
                      <>
                        <PlusCircle size={18} /> Continuer l'inventaire
                      </>
                    )}
                  </button>
                  <button
                    onClick={download}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-700"
                  >
                    <Download size={17} /> Terminer & Télécharger
                  </button>
                </div>
              </div>
            </div>

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            {/* ── Results table ─────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-black">Aperçu des résultats cumulés</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Les 200 premières lignes sont affichées. L'Excel final
                    contient l'intégralité.
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
                    <option value="Traité">Traité</option>
                    <option value="Deplacé">Deplacé</option>
                    <option value="Non_Trouvé">NON TROUVÉ</option>
                    <option value="Nouveau">NOUVEAU</option>
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
          </div>
        )}

        {/* Error in phase 1 */}
        {!session && error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}
