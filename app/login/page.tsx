"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GitCompareArrows,
  KeyRound,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [recoveryCodeSent, setRecoveryCodeSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = recoveryMode
        ? recoveryCodeSent
          ? "/api/password/reset"
          : "/api/password/recovery"
        : "/api/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recoveryMode
            ? recoveryCodeSent
              ? { username, email, recoveryCode, newPassword }
              : { username, email }
            : {
                username,
                password,
                ...(email.trim() ? { email: email.trim() } : {}),
              },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connexion impossible.");
      if (recoveryMode && !recoveryCodeSent) {
        setRecoveryCodeSent(true);
        setError(
          data.message || "Vérifiez votre adresse email pour obtenir le code.",
        );
      } else if (recoveryMode) {
        setRecoveryMode(false);
        setPassword("");
        setNewPassword("");
        setRecoverySecret("");
        setError("Mot de passe réinitialisé. Vous pouvez vous connecter.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Connexion impossible.";
      if (message === "EMAIL_REQUIRED") setSetupMode(true);
      setError(
        message === "EMAIL_REQUIRED"
          ? "Ajoutez une adresse email de récupération pour créer votre compte."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid-bg relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 text-slate-900">
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-indigo-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-950">
                <GitCompareArrows size={22} />
              </div>
              <div>
                <div className="text-lg font-black tracking-tight">
                  InventoMatch
                </div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                  Réconciliation de l'inventaire
                </div>
              </div>
            </div>
            <div className="mt-24 max-w-sm">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200">
                <KeyRound size={14} /> Espace sécurisé
              </div>
              <h1 className="text-4xl font-black leading-tight tracking-tight">
                Vos inventaires, enfin alignés.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Retrouvez votre espace de réconciliation et transformez vos
                fichiers Excel en résultats fiables.
              </p>
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500">
            Une lecture claire. Une décision plus rapide.
          </p>
        </section>

        <section className="p-7 sm:p-10 lg:p-14">
          <div className="mb-10 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                <GitCompareArrows size={22} />
              </div>
              <div className="text-lg font-black tracking-tight">
                InventoMatch
              </div>
            </div>
          </div>
          <div className="max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">
              Bienvenue
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Connectez-vous à votre espace
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {recoveryMode
                ? "Un code temporaire sera envoyé à votre adresse email."
                : "Saisissez vos identifiants pour accéder à la réconciliation."}
            </p>

            <form onSubmit={login} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Nom d'utilisateur
                </span>
                <div className="relative">
                  <UserRound
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="Votre nom d'utilisateur"
                  />
                </div>
              </label>
              {recoveryMode && (
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Adresse email de récupération
                  </span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="vous@exemple.com"
                  />
                </label>
              )}
              {!recoveryMode && (
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Mot de passe
                  </span>
                  <div className="relative">
                    <LockKeyhole
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-12 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      placeholder="Votre mot de passe"
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              )}
              {!recoveryMode && (
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">
                    Email de récupération{" "}
                    <span className="font-normal text-slate-400">
                      (première connexion)
                    </span>
                  </span>
                  <input
                    required={setupMode}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="vous@exemple.com"
                  />
                </label>
              )}
              {recoveryMode && recoveryCodeSent && (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Code reçu par email
                    </span>
                    <input
                      required
                      inputMode="numeric"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      placeholder="6 chiffres"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Nouveau mot de passe
                    </span>
                    <input
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      placeholder="8 caractères minimum"
                    />
                  </label>
                </>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                >
                  {error}
                </p>
              )}
              <button
                disabled={loading}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
              >
                {loading
                  ? "Traitement..."
                  : recoveryMode
                    ? recoveryCodeSent
                      ? "Réinitialiser le mot de passe"
                      : "Envoyer le code"
                    : "Se connecter"}
                {!loading && (
                  <ArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-1"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(!recoveryMode);
                  setRecoveryCodeSent(false);
                  setError("");
                }}
                className="w-full text-sm font-bold text-indigo-600 hover:text-indigo-800"
              >
                {recoveryMode
                  ? "Retour à la connexion"
                  : "Mot de passe oublié ?"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
