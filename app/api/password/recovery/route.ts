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
  const recoveryEmail = user?.recoveryEmail?.trim().toLowerCase();

  if (user && recoveryEmail && recoveryEmail !== email) {
    return NextResponse.json(
      {
        error:
          "Cette adresse email ne correspond pas à celle enregistrée lors de la création de votre compte.",
      },
      { status: 400 },
    );
  }

  if (user && recoveryEmail === email) {
    try {
      await sendRecoveryCode(email, user.username);
    } catch (error) {
      console.error("Password recovery email failed:", error);
      return NextResponse.json(
        {
          error:
            "Impossible d'envoyer l'email. Verifiez la configuration Brevo et la variable BREVO_API_KEY.",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Un code a ete envoye a votre adresse email.",
  });
}
