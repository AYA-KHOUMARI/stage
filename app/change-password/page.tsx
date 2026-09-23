"use client";

import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  GitCompareArrows,
  LockKeyhole,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const response = await fetch("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Modification impossible.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Mot de passe modifié avec succès.");
  }

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft sm:p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
            <GitCompareArrows size={22} />
          </div>
          <div className="text-lg font-black tracking-tight">InventoMatch</div>
        </div>
        <h1 className="mt-10 text-3xl font-black tracking-tight text-slate-950">
          Sécuriser mon compte
        </h1>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Mot de passe actuel
            </span>
            <div className="relative">
              <LockKeyhole
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Nouveau mot de passe
            </span>
            <input
              required
              minLength={8}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              placeholder="8 caractères minimum"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
            >
              {error}
            </p>
          )}
          {message && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={17} />
              {message}
            </p>
          )}
          <button className="w-full rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white hover:bg-indigo-700">
            Enregistrer les changements
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex w-full items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Retour à l'inventaire
          </button>
        </form>
      </section>
    </main>
  );
}
