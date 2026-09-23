import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { verifyRecoveryCode } from "@/lib/recovery";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const recoveryCode = body?.recoveryCode;
  const newPassword = body?.newPassword;

  const check = await verifyRecoveryCode(username, email, recoveryCode);
  if (check.status === "expired") {
    return NextResponse.json(
      {
        error:
          "Ce code a expiré. Cliquez sur « Mot de passe oublié ? » pour en recevoir un nouveau.",
      },
      { status: 400 },
    );
  }
  if (check.status !== "ok") {
    return NextResponse.json(
      { error: "Informations de récupération incorrectes." },
      { status: 401 },
    );
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }

  await getPool().execute(
    "UPDATE app_users SET password_hash = ?, recovery_code_hash = NULL, recovery_code_expires_at = NULL WHERE id = ?",
    [await hashPassword(newPassword), check.userId],
  );
  return NextResponse.json({ ok: true });
}
