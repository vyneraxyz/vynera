"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Box,
  Check,
  CheckCircle2,
  ExternalLink,
  Link2,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3 } from "@/lib/autonomys/amounts";
import { BLOCK_TIME_SECONDS, CHAINS, challengeBlocks, challengeHint } from "@/lib/constants";
import { useTxStore } from "@/store/transactions";
import { useWalletStore } from "@/store/wallet";
import type { TxPhase } from "@/types";
import { RouteVisual } from "./ReviewDialog";

// ─── Step definitions ────────────────────────────────────────────────────────

const STEP_DEFS = [
  { id: "inBlock" as TxPhase, label: "Included in block", hint: "Source chain", Icon: Box },
  { id: "challenge" as TxPhase, label: "Challenge period", hint: "", Icon: Shield },
  { id: "relayed" as TxPhase, label: "Relayed", hint: "XDM message bridged", Icon: Link2 },
  {
    id: "executed" as TxPhase,
    label: "Executed on destination",
    hint: "Tokens available",
    Icon: CheckCircle2,
  },
] as const;

const PHASE_TO_STEP: Partial<Record<TxPhase, number>> = {
  inBlock: 0,
  finalized: 0,
  challenge: 1,
  relayed: 2,
  executed: 3,
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="spin-anim"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── StatusTimeline ───────────────────────────────────────────────────────────

interface StatusTimelineProps {
  onClose: () => void;
  onSendAnother: () => void;
}

export function StatusTimeline({ onClose, onSendAnother }: StatusTimelineProps) {
  const { activeTx, completeActiveTx } = useTxStore();
  const network = useWalletStore((s) => s.network);

  // Tick every block during challenge so the time-based counter updates.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (activeTx?.phase !== "challenge") return;
    const id = setInterval(() => setNow(Date.now()), BLOCK_TIME_SECONDS * 1000);
    return () => clearInterval(id);
  }, [activeTx]);

  // Move tx to history on close (only when terminal state reached)
  const handleCloseDialog = useCallback(() => {
    const current = useTxStore.getState().activeTx;
    if (current?.phase === "executed" || current?.phase === "error") {
      completeActiveTx();
    }
    onClose();
  }, [completeActiveTx, onClose]);

  const handleSendAnother = useCallback(() => {
    completeActiveTx();
    onSendAnother();
  }, [completeActiveTx, onSendAnother]);

  // ── All hooks above; conditional render below ──────────────────────────────

  const tx = activeTx;
  if (!tx) return null;

  const currentStep = PHASE_TO_STEP[tx.phase] ?? -1;
  const isComplete = tx.phase === "executed";
  const isError = tx.phase === "error";

  const period = challengeBlocks(tx.direction);
  const elapsedBlocks = (() => {
    // Prefer real block numbers from the WebSocket subscription
    if (tx.challengeCurrentBlock !== undefined && tx.challengeStartBlock !== undefined) {
      return Math.min(period, tx.challengeCurrentBlock - tx.challengeStartBlock);
    }
    // Fall back to wall-clock time when WebSocket is unavailable
    if (tx.challengeStartTime !== undefined) {
      const elapsedMs = now - tx.challengeStartTime;
      return Math.min(period, Math.floor(elapsedMs / (BLOCK_TIME_SECONDS * 1000)));
    }
    return 0;
  })();
  const challengeProgress = Math.min(100, (elapsedBlocks / period) * 100);

  const progressPct = (() => {
    if (isComplete) return 100;
    const segments = [0, 10, 80, 92, 100];
    const base = segments[currentStep] ?? 0;
    const next = segments[currentStep + 1] ?? base;
    const inner = currentStep === 1 ? (challengeProgress / 100) * (next - base) : 0;
    return Math.min(100, base + inner);
  })();

  const explorerUrl = (() => {
    if (!tx.hash) return null;
    if (tx.direction === "c2e") {
      return `${CHAINS[network].consensus.explorerBase}/extrinsics/${tx.hash}`;
    }
    // E2C uses the precompile — hash is an EVM tx hash
    return `${CHAINS[network].evm.explorerBase}/tx/${tx.hash}`;
  })();

  const fromChain = tx.direction === "c2e" ? "consensus" : "evm";
  const toChain = tx.direction === "c2e" ? "evm" : "consensus";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{
          background: "var(--modal-backdrop)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={handleCloseDialog}
      />

      <div
        className="fixed inset-0 flex items-center justify-center p-0 sm:p-4 pointer-events-none z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-title"
        aria-live="polite"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="pointer-events-auto w-full sm:max-w-[520px] h-full sm:h-auto overflow-auto"
        >
          <div className="modal-surface rounded-none sm:rounded-3xl h-full sm:h-auto p-6 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="mb-1">
                  {isComplete ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-accent font-medium">
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" /> Success
                    </span>
                  ) : isError ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-c2 font-medium">
                      <AlertCircle size={11} aria-hidden="true" /> Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-c2 font-medium">
                      <Spinner size={11} /> Submitted
                    </span>
                  )}
                </div>
                <h2
                  id="status-title"
                  className="text-c1 text-lg font-semibold tracking-tight"
                >
                  {isComplete
                    ? "Transfer complete"
                    : isError
                      ? "Transfer failed"
                      : "Transfer in progress"}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCloseDialog}
                className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Error state */}
            {isError && (
              <div className="surface-2 rounded-2xl p-5 mb-4 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 70%)",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  <AlertCircle size={24} className="text-c1" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="text-c1 font-medium">{tx.error ?? "Transaction failed"}</p>
                <p className="text-c2 text-sm mt-1">Your funds were not moved.</p>
              </div>
            )}

            {/* Amount + Route */}
            {!isError && (
              <div className="surface-2 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-c3">Amount</div>
                    <div className="text-c1 font-mono font-medium text-lg">
                      {formatAI3(BigInt(tx.amount), 4)}{" "}
                      <span className="text-c3 text-xs">AI3</span>
                    </div>
                  </div>
                  {tx.hash && (
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wider text-c3">Tx hash</div>
                      <button
                        type="button"
                        onClick={() => explorerUrl && window.open(explorerUrl, "_blank", "noopener,noreferrer")}
                        className="tip-trigger relative text-c1 font-mono text-xs inline-flex items-center gap-1 hover:text-accent transition"
                      >
                        {truncateAddress(tx.hash, 6, 6)}
                        <ExternalLink size={12} className="text-c3" aria-hidden="true" />
                        <span className="tip">View on explorer</span>
                      </button>
                    </div>
                  )}
                </div>
                <RouteVisual
                  fromChain={fromChain}
                  toChain={toChain}
                  fromAddr={fromChain === "consensus" ? toAutonomysAddress(tx.fromAddress) : tx.fromAddress}
                  toAddr={toChain === "consensus" ? toAutonomysAddress(tx.toAddress) : tx.toAddress}
                  animated={!isComplete}
                />
              </div>
            )}

            {/* Progress bar */}
            {!isError && (
              <div className="mb-4">
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                  role="progressbar"
                  aria-valuenow={Math.round(progressPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full rounded-full"
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
                    style={{
                      background:
                        "linear-gradient(90deg, #6E3AFF 0%, #8A5DFF 60%, #6E3AFF 100%)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Steps */}
            {!isError && (
              <div className="flex flex-col gap-1 mb-5">
                {STEP_DEFS.map((step, i) => {
                  const stepDone = i < currentStep || isComplete;
                  const stepActive = i === currentStep && !isComplete;
                  const { Icon } = step;
                  const showSubProgress = stepActive && step.id === "challenge";

                  return (
                    <div key={step.id} className="flex items-center gap-3 py-2 px-1">
                      <div
                        className="relative flex items-center justify-center shrink-0"
                        style={{ width: 28, height: 28 }}
                      >
                        {stepDone && (
                          <span
                            className="absolute inset-0 rounded-full burst"
                            style={{
                              background:
                                "radial-gradient(circle, rgba(110,58,255,0.5), rgba(110,58,255,0) 70%)",
                            }}
                            aria-hidden="true"
                          />
                        )}
                        <div
                          className="relative w-7 h-7 rounded-full flex items-center justify-center"
                          style={{
                            background: stepDone
                              ? "linear-gradient(180deg, #7a47ff, #5b2ce0)"
                              : stepActive
                                ? "linear-gradient(180deg, rgba(110,58,255,0.28), rgba(110,58,255,0.08))"
                                : "rgba(255,255,255,0.04)",
                            border:
                              "1px solid " +
                              (stepDone
                                ? "rgba(110,58,255,0.7)"
                                : stepActive
                                  ? "rgba(110,58,255,0.4)"
                                  : "var(--border-1)"),
                            color: stepDone || stepActive ? "#fff" : "var(--text-3)",
                            boxShadow: stepDone
                              ? "0 0 0 1px rgba(110,58,255,0.35), 0 0 16px -2px rgba(110,58,255,0.5)"
                              : "none",
                          }}
                          aria-hidden="true"
                        >
                          {stepDone ? (
                            <Check size={13} strokeWidth={2.5} className="pop-in" />
                          ) : stepActive ? (
                            <Spinner size={13} />
                          ) : (
                            <Icon size={13} />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium ${
                            stepDone || stepActive ? "text-c1" : "text-c3"
                          }`}
                        >
                          {step.label}
                        </div>
                        {showSubProgress ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <div
                              className="h-1 flex-1 rounded-full"
                              style={{ background: "rgba(255,255,255,0.05)" }}
                            >
                              <motion.div
                                className="h-full rounded-full"
                                animate={{ width: `${challengeProgress}%` }}
                                transition={{ duration: 0.8, ease: "linear" }}
                                style={{
                                  background: "linear-gradient(90deg, #6E3AFF, #8A5DFF)",
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-c2">
                              {elapsedBlocks}/{period}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11.5px] text-c3">
                            {step.id === "challenge" ? challengeHint(tx.direction) : step.hint}
                          </div>
                        )}
                      </div>

                      {stepActive && !showSubProgress && (
                        <span className="text-[11px] text-accent font-medium pulse-soft">
                          Working…
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto flex gap-2">
              {isComplete ? (
                <>
                  {explorerUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
                      className="btn-ghost rounded-xl py-3 px-4 flex-1 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Explorer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSendAnother}
                    className="btn-accent rounded-xl py-3 px-4 flex-[2] text-sm font-medium text-white"
                  >
                    Send another
                  </button>
                </>
              ) : (
                <>
                  {explorerUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
                      className="btn-ghost rounded-xl py-3 px-4 flex-1 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Explorer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    className={`btn-ghost rounded-xl py-3 px-4 text-sm font-medium ${explorerUrl ? "flex-1" : "w-full"}`}
                  >
                    Run in background
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

// ─── SigningModal ─────────────────────────────────────────────────────────────

export function SigningModal({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: "var(--modal-backdrop)", backdropFilter: "blur(8px)" }}
        onClick={onCancel}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none z-50">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="pointer-events-auto w-full max-w-[520px]"
        >
          <div className="modal-surface rounded-3xl p-6 flex flex-col">
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-c1 text-lg font-semibold tracking-tight">
                Waiting for signature
              </h2>
              <button
                type="button"
                onClick={onCancel}
                className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
                aria-label="Cancel"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex flex-col items-center text-center py-10 px-6">
              <div className="relative" style={{ width: 96, height: 96 }}>
                <div
                  className="absolute inset-0 rounded-full pulse-soft"
                  aria-hidden="true"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(110,58,255,0.4) 0%, rgba(110,58,255,0) 70%)",
                  }}
                />
                <div className="absolute inset-3 rounded-full surface-2 flex items-center justify-center">
                  <Wallet size={32} className="text-c1" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-6 text-c1 text-base font-medium">Approve in your wallet</div>
              <div className="text-c2 text-sm mt-1 max-w-[280px]">
                Open your wallet extension to review and sign the transaction.
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="btn-ghost rounded-xl py-3 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
