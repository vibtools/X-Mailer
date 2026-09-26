import crypto from "crypto";

function resolveAuthSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) {
    console.warn(
      "[Auth] WARNING: JWT_SECRET / AUTH_SECRET is not configured. Using a local development fallback only.",
    );
  }
  return secret || "r_sender_development_secret_change_me";
}

const AUTH_SECRET = resolveAuthSecret();

/**
 * Hashes a plaintext password using PBKDF2 with 10,000 iterations and a unique salt.
 * Returns salt:hash format.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a salt:hash string using timingSafeEqual to prevent timing attacks.
 */
export function verifyPassword(
  password: string,
  combinedHash?: string,
): boolean {
  if (!combinedHash || !combinedHash.includes(":")) {
    return false;
  }
  const [salt, originalHash] = combinedHash.split(":");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(originalHash, "hex"),
  );
}

/**
 * Generates a signed cryptographic session token with expiration.
 */
export function generateToken(payload: {
  id: string;
  email: string;
  role: string;
}): string {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days expiration
  });
  const encodedData = Buffer.from(data).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(encodedData)
    .digest("base64url");
  return `${encodedData}.${signature}`;
}

/**
 * Verifies and decodes a signed cryptographic session token.
 */
export function verifyToken(
  token: string,
): { id: string; email: string; role: string } | null {
  try {
    if (!token || !token.includes(".")) return null;
    const [encodedData, signature] = token.split(".");
    const expectedSignature = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(encodedData)
      .digest("base64url");
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      return null;
    }
    const decoded = JSON.parse(
      Buffer.from(encodedData, "base64url").toString("utf8"),
    );
    if (decoded.exp && Date.now() > decoded.exp) {
      return null; // Expired
    }
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

/**
 * In-memory brute force protection tracker for login attempts
 */
const loginAttempts: { [key: string]: { count: number; lockUntil: number } } =
  {};

export function checkRateLimit(key: string): {
  allowed: boolean;
  waitSeconds?: number;
} {
  const record = loginAttempts[key];
  if (!record) return { allowed: true };

  if (record.lockUntil > Date.now()) {
    const waitSeconds = Math.ceil((record.lockUntil - Date.now()) / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  if (!loginAttempts[key]) {
    loginAttempts[key] = { count: 1, lockUntil: 0 };
    return;
  }

  loginAttempts[key].count += 1;
  if (loginAttempts[key].count >= 5) {
    // Lock for 60 seconds after 5 failed attempts
    loginAttempts[key].lockUntil = now + 60 * 1000;
  }
}

export function resetAttempts(key: string): void {
  delete loginAttempts[key];
}
