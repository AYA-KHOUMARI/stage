export const SESSION_COOKIE = "inventomatch_session";

const SESSION_TTL_SECONDS = 60 * 60 * 8;

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  return atob(
    value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4),
  );
}

async function signature(payload: string) {
  const secret = new TextEncoder().encode(
    process.env.SESSION_SECRET || "set-a-strong-session-secret",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encode(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function createSession(userId: number, username: string) {
  const payload = encode(
    JSON.stringify({
      userId,
      username,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  );
  return `${payload}.${await signature(payload)}`;
}

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  const [payload, providedSignature] = token.split(".");
  if (
    !payload ||
    !providedSignature ||
    providedSignature !== (await signature(payload))
  )
    return null;
  try {
    const session = JSON.parse(decode(payload)) as {
      userId: number;
      username: string;
      expiresAt: number;
    };
    return session.expiresAt > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}
