import { createHash, randomInt } from "crypto";
import { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/mail";

const RECOVERY_CODE_TTL_MINUTES = 30;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function normalizeRecoveryCode(code: unknown) {
  return String(code ?? "")
    .trim()
    .replace(/\s/g, "");
}

export async function sendRecoveryCode(email: string, username: string) {
  const code = String(randomInt(100000, 1000000));
  await getPool().execute(
    "UPDATE app_users SET recovery_code_hash = ?, recovery_code_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE username = ?",
    [hashCode(code), RECOVERY_CODE_TTL_MINUTES, username],
  );

  await sendTransactionalEmail({
    to: email,
    subject: "Votre code InventoMatch",
    text: `Votre code de récupération InventoMatch est ${code}. Il expire dans ${RECOVERY_CODE_TTL_MINUTES} minutes.`,
  });
}

type RecoveryCheckRow = RowDataPacket & {
  id: number;
  stillValid: number;
};

export async function verifyRecoveryCode(
  username: string,
  email: string,
  code: unknown,
): Promise<
  | { status: "ok"; userId: number }
  | { status: "invalid" }
  | { status: "expired" }
> {
  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = normalizeRecoveryCode(code);
  if (!normalizedUsername || !normalizedEmail || !normalizedCode) {
    return { status: "invalid" };
  }

  const [rows] = await getPool().query<RecoveryCheckRow[]>(
    `SELECT id, (recovery_code_expires_at > NOW()) AS stillValid
     FROM app_users
     WHERE username = ? AND LOWER(recovery_email) = ? AND recovery_code_hash = ?`,
    [normalizedUsername, normalizedEmail, hashCode(normalizedCode)],
  );
  const match = rows[0];
  if (!match) return { status: "invalid" };
  if (!match.stillValid) return { status: "expired" };
  return { status: "ok", userId: match.id };
}

export function isRecoveryCodeValid(
  code: string,
  storedHash: string | null,
  expiresAt: Date | null,
) {
  return Boolean(
    storedHash &&
      expiresAt &&
      expiresAt.getTime() > Date.now() &&
      hashCode(normalizeRecoveryCode(code)) === storedHash,
  );
}
