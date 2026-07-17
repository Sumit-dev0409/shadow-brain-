"use client";

import { useState, createElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Puzzle, Download, ExternalLink, Check, FolderOpen, ToggleRight, MousePointerClick } from "lucide-react";

interface ExtensionInstallModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "prompt" | "instructions";

export function ExtensionInstallModal({ open, onClose }: ExtensionInstallModalProps) {
  const [step, setStep] = useState<Step>("prompt");

  function handleAllow() {
    // Real navigation (not fetch) so the browser handles it as a normal file download.
    window.location.href = "/api/download-extension";
    setStep("instructions");
  }

  function handleClose() {
    onClose();
    // Reset for next time the modal is opened (e.g. from a settings link), after the close animation.
    setTimeout(() => setStep("prompt"), 250);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70]"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={step === "prompt" ? handleClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed z-[71] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[440px] rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <h2 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Puzzle size={16} style={{ color: "var(--blue)" }} />
                {step === "prompt" ? "Enable automatic capture" : "Install the extension"}
              </h2>
              <button onClick={handleClose} className="p-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>
                <X size={16} />
              </button>
            </div>

            {step === "prompt" ? (
              <div className="p-5 flex flex-col gap-5">
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Install the Brain Shadow browser extension to automatically capture your
                  conversations from ChatGPT, Claude, Gemini, and other AI platforms as you chat —
                  no manual exporting needed.
                </p>

                <div className="flex gap-2.5">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-xl text-[12.5px] font-medium"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                  >
                    Not now
                  </button>
                  <motion.button
                    onClick={handleAllow}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-semibold"
                    style={{ background: "var(--accent-gradient)", color: "white" }}
                  >
                    <Download size={14} />
                    Allow
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4">
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px]"
                  style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}
                >
                  <Check size={14} className="flex-shrink-0" />
                  Downloading brain-shadow-universal-extension.zip — finish setup below.
                </div>

                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Chrome can&apos;t install extensions automatically from a website — finish these
                  four quick steps once the download completes:
                </p>

                <ol className="flex flex-col gap-3">
                  <InstructionStep icon={FolderOpen} n={1}>
                    Unzip the downloaded file.
                  </InstructionStep>
                  <InstructionStep icon={ExternalLink} n={2}>
                    Open <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg-surface)" }}>chrome://extensions</code> in a new tab.
                  </InstructionStep>
                  <InstructionStep icon={ToggleRight} n={3}>
                    Turn on <strong>Developer mode</strong> (top right).
                  </InstructionStep>
                  <InstructionStep icon={MousePointerClick} n={4}>
                    Click <strong>Load unpacked</strong> and select the unzipped folder.
                  </InstructionStep>
                </ol>

                <button
                  onClick={handleClose}
                  className="mt-1 py-2.5 rounded-xl text-[12.5px] font-semibold"
                  style={{ background: "var(--accent-gradient)", color: "white" }}
                >
                  Got it
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InstructionStep({
  icon: Icon,
  n,
  children,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold flex-shrink-0"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
      >
        {n}
      </span>
      <span className="text-[12.5px] leading-relaxed flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-primary)" }}>
        {createElement(Icon, { size: 13, style: { color: "var(--text-muted)" }, className: "flex-shrink-0" })}
        {children}
      </span>
    </li>
  );
}
