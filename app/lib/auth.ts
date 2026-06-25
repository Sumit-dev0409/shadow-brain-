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

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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
