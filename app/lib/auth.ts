/**
 * Lightweight, front-end-only auth for the Shadow Brain demo.
 *
 * There is no backend in this project, so "accounts" live in the browser's
 * localStorage and passwords are hashed (SHA-256) before being stored.
 * This is good enough to demo a real login flow, but it is NOT a substitute
 * for a real auth backend — anyone with devtools access to this browser can
 * see the stored data. Swap this out for a real API once one exists.
 */

const USERS_KEY = "shadowbrain_users";
const SESSION_KEY = "shadowbrain_session";
const AGENTS_KEY = "shadowbrain_selected_agents";
const REMEMBER_KEY = "shadowbrain_remember";
const SAVED_EMAIL_KEY = "shadowbrain_saved_email";
const EXTENSION_PROMPT_SEEN_KEY = "shadowbrain_extension_prompt_seen";

interface StoredUser {
  email: string;
  passwordHash: string;
  resetToken?: string;
  resetTokenExpiry?: number;
}

interface Session {
  email: string;
}

export interface PasswordRules {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export type AuthResult = { ok: true; email: string } | { ok: false; error: string };
export type ResetResult = { ok: true } | { ok: false; error: string };

/** Live checklist used by the UI as the user types. */
export function checkPassword(password: string): PasswordRules {
  return {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const rules = checkPassword(password);
  return rules.minLength && rules.hasLetter && rules.hasNumber && rules.hasSymbol;
}

export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(bytes: Uint8Array): string {
  const paddingLength = (64 - ((bytes.length + 1 + 8) % 64)) % 64;
  const message = new Uint8Array(bytes.length + 1 + paddingLength + 8);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const bitLengthHigh = Math.floor(bytes.length / 0x20000000);
  const bitLengthLow = (bytes.length << 3) >>> 0;
  const lengthOffset = message.length - 8;
  message[lengthOffset] = bitLengthHigh >>> 24;
  message[lengthOffset + 1] = bitLengthHigh >>> 16;
  message[lengthOffset + 2] = bitLengthHigh >>> 8;
  message[lengthOffset + 3] = bitLengthHigh;
  message[lengthOffset + 4] = bitLengthLow >>> 24;
  message[lengthOffset + 5] = bitLengthLow >>> 16;
  message[lengthOffset + 6] = bitLengthLow >>> 8;
  message[lengthOffset + 7] = bitLengthLow;

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];
  const words = new Array<number>(64);

  for (let chunk = 0; chunk < message.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const offset = chunk + i * 4;
      words[i] =
        ((message[offset] << 24) |
          (message[offset + 1] << 16) |
          (message[offset + 2] << 8) |
          message[offset + 3]) >>>
        0;
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + words[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    return sha256Hex(bytes);
  }

  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getUsers(): StoredUser[] {
  return readJSON<StoredUser[]>(USERS_KEY) ?? [];
}

export async function signUp(
  email: string,
  password: string,
  confirmPassword: string
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isEmailValid(normalizedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!isPasswordValid(password)) {
    return {
      ok: false,
      error: "Password must be 8+ characters with a letter, a number, and a symbol.",
    };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const users = getUsers();
  if (users.some((u) => u.email === normalizedEmail)) {
    return { ok: false, error: "An account with this email already exists. Try logging in." };
  }

  const passwordHash = await hashPassword(password);
  users.push({ email: normalizedEmail, passwordHash });
  writeJSON(USERS_KEY, users);
  setSession(normalizedEmail);
  return { ok: true, email: normalizedEmail };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const users = getUsers();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return { ok: false, error: "No account found with that email. Try signing up instead." };
  }

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, error: "Incorrect password." };
  }

  setSession(normalizedEmail);
  return { ok: true, email: normalizedEmail };
}

// ── Remember Me ─────────────────────────────────────────────────────────────

export function saveRememberMe(email: string) {
  if (typeof window === "undefined") return;
  writeJSON(REMEMBER_KEY, true);
  window.localStorage.setItem(SAVED_EMAIL_KEY, email);
}

export function clearRememberMe() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REMEMBER_KEY);
  window.localStorage.removeItem(SAVED_EMAIL_KEY);
}

export function getSavedEmail(): string | null {
  if (typeof window === "undefined") return null;
  const remembered = readJSON<boolean>(REMEMBER_KEY);
  if (!remembered) return null;
  return window.localStorage.getItem(SAVED_EMAIL_KEY);
}

// ── Forgot Password ──────────────────────────────────────────────────────────

/**
 * Generates a 6-digit reset code and stores it (hashed) against the user.
 * In a real app this would send an email; here we return the code directly
 * so it can be shown in the UI as a "simulated email".
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = getUsers();
  const userIndex = users.findIndex((u) => u.email === normalizedEmail);

  if (userIndex === -1) {
    // Don't reveal whether the email exists — just pretend it worked.
    // Return a fake code so the UI flow stays consistent.
    return { ok: true, code: Math.floor(100000 + Math.random() * 900000).toString() };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const tokenHash = await hashPassword(code);
  users[userIndex].resetToken = tokenHash;
  users[userIndex].resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 min
  writeJSON(USERS_KEY, users);

  return { ok: true, code };
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
  confirmPassword: string
): Promise<ResetResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isPasswordValid(newPassword)) {
    return { ok: false, error: "Password must be 8+ characters with a letter, a number, and a symbol." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const users = getUsers();
  const userIndex = users.findIndex((u) => u.email === normalizedEmail);
  if (userIndex === -1) {
    return { ok: false, error: "Invalid or expired reset code." };
  }

  const user = users[userIndex];
  if (!user.resetToken || !user.resetTokenExpiry) {
    return { ok: false, error: "No reset was requested for this account." };
  }
  if (Date.now() > user.resetTokenExpiry) {
    return { ok: false, error: "Reset code has expired. Please request a new one." };
  }

  const codeHash = await hashPassword(code.trim());
  if (codeHash !== user.resetToken) {
    return { ok: false, error: "Incorrect reset code." };
  }

  users[userIndex].passwordHash = await hashPassword(newPassword);
  delete users[userIndex].resetToken;
  delete users[userIndex].resetTokenExpiry;
  writeJSON(USERS_KEY, users);

  return { ok: true };
}

// ── Session ──────────────────────────────────────────────────────────────────

export function setSession(email: string) {
  writeJSON(SESSION_KEY, { email } satisfies Session);
}

export function getSession(): Session | null {
  return readJSON<Session>(SESSION_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function getSelectedAgents(): string[] {
  return readJSON<string[]>(AGENTS_KEY) ?? [];
}

export function setSelectedAgents(agentIds: string[]) {
  writeJSON(AGENTS_KEY, agentIds);
}

export function clearSelectedAgents() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AGENTS_KEY);
}

// ── Extension install prompt (shown once per account, on first sign-in) ─────

export function hasSeenExtensionPrompt(email: string): boolean {
  const seen = readJSON<string[]>(EXTENSION_PROMPT_SEEN_KEY) ?? [];
  return seen.includes(email.trim().toLowerCase());
}

export function markExtensionPromptSeen(email: string) {
  const seen = readJSON<string[]>(EXTENSION_PROMPT_SEEN_KEY) ?? [];
  const normalized = email.trim().toLowerCase();
  if (!seen.includes(normalized)) {
    writeJSON(EXTENSION_PROMPT_SEEN_KEY, [...seen, normalized]);
  }
}
