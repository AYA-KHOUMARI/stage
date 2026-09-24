/**
 * Transactional email via Brevo HTTP API (port 443 – works on Railway).
 *
 * Required environment variable:
 *   BREVO_API_KEY   – your Brevo v3 API key (Settings → API keys)
 *
 * Optional:
 *   MAIL_FROM       – sender address shown to recipients
 *                     (defaults to the verified sender on your Brevo account)
 */

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

function mailFrom(): { email: string; name?: string } {
  const raw =
    process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;

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
      "BREVO_API_KEY is not set. Add it to your Railway environment variables.",
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
    throw new Error(
      `Brevo API error ${response.status}: ${body}`,
    );
  }
}
