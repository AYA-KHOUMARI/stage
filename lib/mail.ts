/**
 * Transactional email via the Brevo HTTP API.
 *
 * Required environment variable:
 *   BREVO_API_KEY - Brevo v3 API key
 *
 * Optional:
 *   MAIL_FROM - verified sender address, optionally in
 *               "Display Name <email@domain.com>" format
 */

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

function mailFrom(): { email: string; name?: string } {
  const raw = process.env.MAIL_FROM;

  if (!raw) {
    throw new Error(
      "Email sender not configured. Set MAIL_FROM in your environment.",
    );
  }

  // Support "Display Name <email@domain.com>" format
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: raw.trim() };
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "BREVO_API_KEY is not set. Add it to .env.local for local development and to Railway environment variables for deployment.",
    );
  }

  const sender = mailFrom();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${body}`);
  }
}
