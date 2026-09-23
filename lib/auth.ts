import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getPool } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const scrypt = promisify(scryptCallback);
export { SESSION_COOKIE } from "@/lib/auth-constants";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  return (
    storedKey.length === derivedKey.length &&
    timingSafeEqual(storedKey, derivedKey)
  );
}

export type AppUser = {
  id: number;
  username: string;
  recoveryEmail: string | null;
  passwordHash: string;
  recoveryCodeHash: string | null;
  recoveryCodeExpiresAt: Date | null;
};

export async function getUser(username: string) {
  const [rows] = await getPool().query(
    "SELECT id, username, recovery_email AS recoveryEmail, password_hash AS passwordHash, recovery_code_hash AS recoveryCodeHash, recovery_code_expires_at AS recoveryCodeExpiresAt FROM app_users WHERE username = ?",
    [username.trim()],
  );
  return (rows as AppUser[])[0] || null;
}

export async function getUserById(id: number) {
  const [rows] = await getPool().query(
    "SELECT id, username, recovery_email AS recoveryEmail, password_hash AS passwordHash, recovery_code_hash AS recoveryCodeHash, recovery_code_expires_at AS recoveryCodeExpiresAt FROM app_users WHERE id = ?",
    [id],
  );
  return (rows as AppUser[])[0] || null;
}

export async function registerUser(
  username: string,
  email: string,
  password: string,
) {
  try {
    await getPool().execute(
      "INSERT INTO app_users (username, recovery_email, password_hash) VALUES (?, ?, ?)",
      [username, email, await hashPassword(password)],
    );
    return getUser(username);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return null;
    throw error;
  }
}
