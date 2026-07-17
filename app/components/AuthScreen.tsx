"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Check,
  Loader2, KeyRound, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { Logo } from "./Logo";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  checkPassword,
  isEmailValid,
  login,
  signUp,
  requestPasswordReset,
  resetPassword,
  saveRememberMe,
  clearRememberMe,
  getSavedEmail,
  setSession,
} from "@/app/lib/auth";
import { googleLogin } from "@/app/lib/api";

interface AuthScreenProps {
  onAuthenticated: (email: string) => void;
}

type Mode = "login" | "signup" | "forgot" | "reset";

function RuleRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: met ? "#34d399" : "var(--text-muted)" }}>
      <span
        className="flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0"
        style={{
          background: met ? "rgba(52,211,153,0.15)" : "transparent",
          border: `1px solid ${met ? "#34d399" : "var(--text-muted)"}`,
        }}
      >
        {met && <Check size={9} />}
      </span>
      {label}
    </div>
  );
}

function InputRow({
  icon: Icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  rightEl,
  invalid,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  rightEl?: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{
          background: "var(--bg-surface)",
          border: `1px solid ${invalid ? "rgba(239,68,68,0.5)" : "var(--border-subtle)"}`,
        }}
      >
        <Icon size={15} style={{ color: "var(--text-muted)" }} />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="flex-1 bg-transparent outline-none text-[13px]"
          style={{ color: "var(--text-primary)" }}
        />
        {rightEl}
      </div>
    </div>
  );
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot/reset flow
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Load saved email on mount
  useEffect(() => {
    const saved = getSavedEmail();
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const rules = checkPassword(password);
  const newRules = checkPassword(newPassword);
  const emailLooksValid = email.length === 0 || isEmailValid(email);

  // ── Main login/signup submit ─────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "login"
        ? await login(email, password)
        : await signUp(email, password, confirmPassword);

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (rememberMe) {
      saveRememberMe(result.email);
    } else {
      clearRememberMe();
    }

    onAuthenticated(result.email);
  }

  // ── Google sign-in ───────────────────────────────────────────────────────
  async function handleGoogleCredential(credential: string) {
    setError(null);
    setLoading(true);
    try {
      const user = await googleLogin(credential);
      setSession(user.email);
      onAuthenticated(user.email);
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password — request code ──────────────────────────────────────
  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await requestPasswordReset(resetEmail);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Show simulated code in a banner (in real app this would be an email)
    setSimulatedCode(result.code);
    setMode("reset");
  }

  // ── Reset password — verify code + set new password ─────────────────────
  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await resetPassword(resetEmail, resetCode, newPassword, confirmNewPassword);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResetSuccess(true);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setSimulatedCode(null);
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setResetSuccess(false);
  }

  const eyeBtn = (show: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} style={{ color: "var(--text-muted)" }}>
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex items-center justify-center min-h-screen w-full px-4"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(34,211,238,0.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(236,72,153,0.12), transparent 40%)",
        }}
      />

      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-[400px] rounded-2xl p-7"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 0 60px rgba(59, 130, 246,0.08)",
        }}
      >
        <div className="flex flex-col items-center mb-6">
          <Logo />
        </div>

        {/* ── Forgot / Reset screens ────────────────────────────────────── */}
        {(mode === "forgot" || mode === "reset") && (
          <>
            {/* Back button */}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="flex items-center gap-1.5 text-[12px] mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              <ArrowLeft size={13} />
              Back to login
            </button>

            <div className="flex items-center gap-2 mb-5">
              <KeyRound size={18} style={{ color: "var(--blue)" }} />
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {mode === "forgot" ? "Reset your password" : "Enter reset code"}
              </h2>
            </div>

            {/* ── Step 1: request code ─────────────────────────────────── */}
            {mode === "forgot" && (
              <form onSubmit={handleForgotRequest} className="flex flex-col gap-3.5">
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Enter your account email and we&apos;ll generate a reset code for you.
                </p>

                <InputRow
                  icon={Mail}
                  label="Email address"
                  type="email"
                  value={resetEmail}
                  onChange={setResetEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                />

                <AnimatePresence>
                  {error && <ErrorBanner message={error} />}
                </AnimatePresence>

                <SubmitButton loading={loading} label="Send reset code" />
              </form>
            )}

            {/* ── Step 2: enter code + new password ───────────────────── */}
            {mode === "reset" && (
              <>
                {/* Simulated email banner */}
                {simulatedCode && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 px-3 py-2.5 rounded-xl mb-4 text-[11.5px]"
                    style={{
                      background: "rgba(52,211,153,0.08)",
                      border: "1px solid rgba(52,211,153,0.25)",
                      color: "#34d399",
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck size={13} />
                      Simulated email (no backend)
                    </div>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Your reset code:{" "}
                      <span className="font-mono font-bold tracking-widest" style={{ color: "#34d399" }}>
                        {simulatedCode}
                      </span>
                    </span>
                  </motion.div>
                )}

                {resetSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 py-4 text-center"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(52,211,153,0.15)", border: "1px solid #34d399" }}
                    >
                      <Check size={20} color="#34d399" />
                    </div>
                    <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                      Password updated! You can now log in.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="text-[12.5px] font-medium"
                      style={{ color: "var(--blue)" }}
                    >
                      Go to login →
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleResetSubmit} className="flex flex-col gap-3.5">
                    <InputRow
                      icon={KeyRound}
                      label="6-digit reset code"
                      type="text"
                      value={resetCode}
                      onChange={setResetCode}
                      placeholder="123456"
                      autoComplete="one-time-code"
                    />

                    <InputRow
                      icon={Lock}
                      label="New password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      rightEl={eyeBtn(showNewPassword, () => setShowNewPassword((v) => !v))}
                    />

                    <InputRow
                      icon={Lock}
                      label="Confirm new password"
                      type={showNewPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={setConfirmNewPassword}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />

                    {/* password rules */}
                    {newPassword.length > 0 && (
                      <div
                        className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 rounded-xl"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                      >
                        <RuleRow met={newRules.minLength} label="8+ characters" />
                        <RuleRow met={newRules.hasLetter} label="A letter" />
                        <RuleRow met={newRules.hasNumber} label="A number" />
                        <RuleRow met={newRules.hasSymbol} label="A symbol" />
                      </div>
                    )}

                    <AnimatePresence>
                      {error && <ErrorBanner message={error} />}
                    </AnimatePresence>

                    <SubmitButton loading={loading} label="Reset password" />
                  </form>
                )}
              </>
            )}
          </>
        )}

        {/* ── Login / Signup screens ────────────────────────────────────── */}
        {(mode === "login" || mode === "signup") && (
          <>
            {/* Mode toggle */}
            <div
              className="flex p-1 rounded-xl mb-6"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="flex-1 py-2 rounded-lg text-[12.5px] font-medium transition-all"
                  style={{
                    background: mode === m ? "var(--bg-hover)" : "transparent",
                    color: mode === m ? "var(--text-primary)" : "var(--text-secondary)",
                    border: mode === m ? "1px solid var(--border-glow)" : "1px solid transparent",
                  }}
                >
                  {m === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            <GoogleSignInButton onCredential={handleGoogleCredential} />

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {/* Email */}
              <InputRow
                icon={Mail}
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                invalid={!emailLooksValid}
              />

              {/* Password */}
              <InputRow
                icon={Lock}
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                rightEl={eyeBtn(showPassword, () => setShowPassword((v) => !v))}
              />

              {/* Confirm password + rule checklist (signup only) */}
              <AnimatePresence mode="wait">
                {mode === "signup" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-3.5 overflow-hidden"
                  >
                    <InputRow
                      icon={Lock}
                      label="Confirm password"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />

                    <div
                      className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 rounded-xl"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                      <RuleRow met={rules.minLength} label="8+ characters" />
                      <RuleRow met={rules.hasLetter} label="A letter" />
                      <RuleRow met={rules.hasNumber} label="A number" />
                      <RuleRow met={rules.hasSymbol} label="A symbol" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Remember me + Forgot password row */}
              <div className="flex items-center justify-between mt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setRememberMe((v) => !v)}
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background: rememberMe ? "var(--accent-gradient)" : "var(--bg-surface)",
                      border: `1px solid ${rememberMe ? "transparent" : "var(--border-subtle)"}`,
                      cursor: "pointer",
                    }}
                  >
                    {rememberMe && <Check size={10} color="white" />}
                  </div>
                  <span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                    {mode === "login" ? "Remember me" : "Save login info"}
                  </span>
                </label>

                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setResetEmail(email); switchMode("forgot"); }}
                    className="text-[11.5px] font-medium"
                    style={{ color: "var(--blue)" }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && <ErrorBanner message={error} />}
              </AnimatePresence>

              <SubmitButton
                loading={loading}
                label={mode === "login" ? "Log in" : "Create account"}
              />
            </form>

            <p className="text-center text-[11.5px] mt-5" style={{ color: "var(--text-muted)" }}>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                className="font-medium"
                style={{ color: "var(--blue)" }}
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px]"
      style={{
        background: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.3)",
        color: "#f87171",
      }}
    >
      <AlertCircle size={13} className="flex-shrink-0" />
      {message}
    </motion.div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      whileHover={{ y: -1, boxShadow: "0 0 24px rgba(59, 130, 246,0.35)" }}
      whileTap={{ scale: 0.98 }}
      className="mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
      style={{
        background: "var(--accent-gradient)",
        color: "white",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : label}
    </motion.button>
  );
}
