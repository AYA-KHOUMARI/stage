import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sendRecoveryCode } from "@/lib/recovery";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const user = username ? await getUser(username) : null;

  if (user?.recoveryEmail && user.recoveryEmail.toLowerCase() === email) {
    try {
      await sendRecoveryCode(email, user.username);
    } catch (error) {
      console.error("Password recovery email failed:", error);
      return NextResponse.json(
        {
          error:
            "Impossible d'envoyer l'email. Verifiez la configuration SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      "Si les informations correspondent, un code a ete envoye a votre adresse email.",
  });
}