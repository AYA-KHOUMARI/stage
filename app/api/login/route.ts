import { NextResponse } from "next/server";
import {
  getUser,
  registerUser,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { createSession } from "@/lib/auth-constants";
import { getPool } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { username, password, email } = body || {};
  if (
    typeof username !== "string" ||
    username.trim().length < 2 ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    return NextResponse.json(
      {
        error:
          "Le nom d’utilisateur doit contenir au moins 2 caractères et le mot de passe 8 caractères.",
      },
      { status: 400 },
    );
  }

  const normalizedUsername = username.trim();
  const existingUser = await getUser(normalizedUsername);
  if (!existingUser && (typeof email !== "string" || !email.includes("@"))) {
    return NextResponse.json(
      {
        error: "EMAIL_REQUIRED",
        message:
          "Pour votre première connexion, ajoutez une adresse email de récupération.",
      },
      { status: 400 },
    );
  }
  const registeredUser = existingUser
    ? null
    : await registerUser(
        normalizedUsername,
        email.trim().toLowerCase(),
        password,
      );
  const user =
    existingUser || registeredUser || (await getUser(normalizedUsername));

  if (
    !user ||
    normalizedUsername !== user.username ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return NextResponse.json(
      { error: "Identifiants incorrects." },
      { status: 401 },
    );
  }

  if (
    !user.recoveryEmail &&
    typeof email === "string" &&
    email.trim().includes("@")
  ) {
    await getPool().execute(
      "UPDATE app_users SET recovery_email = ? WHERE id = ?",
      [email.trim().toLowerCase(), user.id],
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSession(user.id, user.username),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  );
  return response;
}
