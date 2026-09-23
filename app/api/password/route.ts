import { NextResponse } from "next/server";
import { getUserById, hashPassword, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-constants";
import { getPool } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { currentPassword, newPassword } = body || {};
  const token = request.headers
    .get("cookie")
    ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  const session = await verifySession(token);
  const user = session ? await getUserById(session.userId) : null;

  if (!session) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  if (
    !user ||
    !(await verifyPassword(currentPassword || "", user.passwordHash))
  ) {
    return NextResponse.json(
      { error: "Mot de passe actuel incorrect." },
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
    "UPDATE app_users SET password_hash = ? WHERE id = ?",
    [await hashPassword(newPassword), user.id],
  );
  return NextResponse.json({ ok: true });
}
