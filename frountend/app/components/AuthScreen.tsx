"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Check, Loader2 } from "lucide-react";
import { Logo } from "./Logo";
import {
  checkPassword,
  isEmailValid,
  login,
  signUp,
} from "@/app/lib/auth";

interface AuthScreenProps {
  onAuthenticated: (email: string) => void;
}

type Mode = "login" | "signup";

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

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rules = checkPassword(password);
  const emailLooksValid = email.length === 0 || isEmailValid(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = mode === "login" ? await login(email, password) : await signUp(email, password, confirmPassword);

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAuthenticated(result.email);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen w-full px-4"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(79,138,255,0.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.12), transparent 40%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-[400px] rounded-2xl p-7"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 0 60px rgba(79,138,255,0.08)",
        }}
      >
        <div className="flex flex-col items-center mb-6">
          <Logo />
        </div>

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Email */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{
                background: "var(--bg-surface)",
                border: `1px solid ${emailLooksValid ? "var(--border-subtle)" : "rgba(239,68,68,0.5)"}`,
              }}
            >
              <Mail size={15} style={{ color: "var(--text-muted)" }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              Password
            </label>
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <Lock size={15} style={{ color: "var(--text-muted)" }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: "var(--text-primary)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ color: "var(--text-muted)" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm password + live rule checklist, sign-up only */}
          <AnimatePresence mode="wait">
            {mode === "signup" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-3.5 overflow-hidden"
              >
                <div>
                  <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                    Confirm password
                  </label>
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                  >
                    <Lock size={15} style={{ color: "var(--text-muted)" }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      className="flex-1 bg-transparent outline-none text-[13px]"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                </div>

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

          {/* Error */}
          <AnimatePresence>
            {error && (
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
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ y: -1, boxShadow: "0 0 24px rgba(79,138,255,0.35)" }}
            whileTap={{ scale: 0.98 }}
            className="mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
            style={{
              background: "linear-gradient(135deg, #4f8aff, #8b5cf6)",
              color: "white",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : mode === "login" ? (
              "Log in"
            ) : (
              "Create account"
            )}
          </motion.button>
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
      </motion.div>
    </div>
  );
}
