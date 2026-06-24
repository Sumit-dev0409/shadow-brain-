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

interface StoredUser {
  email: string;
  passwordHash: string;
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
