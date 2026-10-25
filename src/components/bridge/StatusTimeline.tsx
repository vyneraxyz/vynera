"use client";

import { motion } from "framer-motion";
import { AlertCircle, Bell, BellRing, Check, ExternalLink, PenLine, Wallet, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3 } from "@/lib/autonomys/amounts";
import { notificationPermission, requestNotificationPermission } from "@/lib/notify";
import { CHAIN_LABEL, CHAIN_TOKEN, LEG_ETA } from "@/lib/routes";
import { legExplorerUrl, nextLegToSign } from "@/lib/transfer/engine";
import { useTxStore } from "@/store/transactions";
import type { Chain, LegPhase, StoredLeg, StoredTx } from "@/types";
import { RouteVisual } from "./ReviewDialog";

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="spin-anim" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const LEG_STATUS: Record<LegPhase, string> = {
  pending: "Waiting to be signed",
  signing: "Waiting for your signature",
  submitted: "Submitted — waiting for a block",
  inBlock: "Included in a block",
  inFlight: "On its way to the destination",
  delivered: "Delivered",
  error: "Failed",
};

/** Legacy transfers (before routes) are shown as a single leg */
export function txLegs(tx: StoredTx): StoredLeg[] {
  if (tx.legs?.length) return tx.legs;
  const c2e = tx.direction === "c2e";
  const phase: LegPhase =
    tx.phase === "error" ? "error" : tx.phase === "delivered" || tx.phase === "executed" ? "delivered" : "inFlight";
  return [
    {
      kind: c2e ? "xdm-c2e" : "xdm-e2c",
      from: c2e ? "consensus" : "evm",
      to: c2e ? "evm" : "consensus",
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      amount: tx.amount,
      phase,
      hash: tx.hash || undefined,
    },
  ];
}

const shortAddr = (chain: Chain, a: string) => (chain === "consensus" ? toAutonomysAddress(a) : a);

function LegRow({ leg, index, total }: { leg: StoredLeg; index: number; total: number }) {
  const done = leg.phase === "delivered";
  const active = !done && leg.phase !== "pending" && leg.phase !== "error";
  const url = legExplorerUrl(leg);
  const amount = BigInt(leg.amount);

  return (
    <div className="flex items-start gap-3 py-2 px-1">
      <div
        className="relative w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: done
            ? "linear-gradient(180deg, #7a47ff, #5b2ce0)"
            : active
              ? "linear-gradient(180deg, rgba(110,58,255,0.28), rgba(110,58,255,0.08))"
              : "rgba(255,255,255,0.04)",
          border: `1px solid ${done ? "rgba(110,58,255,0.7)" : active ? "rgba(110,58,255,0.4)" : "var(--border-1)"}`,
          color: done || active ? "#fff" : "var(--text-3)",
        }}
        aria-hidden="true"
      >
        {done ? (
          <Check size={13} strokeWidth={2.5} className="pop-in" />
        ) : leg.phase === "error" ? (
          <AlertCircle size={13} />
        ) : active ? (
          <Spinner size={13} />
        ) : (
          <span className="text-[11px] font-mono">{index + 1}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${done || active ? "text-c1" : "text-c3"}`}>
          {total > 1 ? `Step ${index + 1}: ` : ""}
          {CHAIN_LABEL[leg.from]} → {CHAIN_LABEL[leg.to]}
          <span className="text-c3 font-mono text-[11.5px] font-normal ml-1.5">
            {formatAI3(amount, 4)} {CHAIN_TOKEN[leg.from]}
          </span>
        </div>
        <div className="text-[11.5px] text-c3">
          {leg.phase === "error" ? leg.error ?? LEG_STATUS.error : LEG_STATUS[leg.phase]}
          {leg.phase === "inFlight" && ` · usually ${LEG_ETA[leg.kind]}`}
          {done && leg.deliveredAt && ` · ${new Date(leg.deliveredAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`}
        </div>
        <div className="text-[11px] text-c3 font-mono">
          to {truncateAddress(shortAddr(leg.to, leg.toAddress), 6, 6)}
        </div>
      </div>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost rounded-md p-1 shrink-0"
          aria-label="View on explorer"
        >
          <ExternalLink size={13} className="text-c3" />
        </a>
      )}
    </div>
  );
}

function NotifyButton({ tx }: { tx: StoredTx }) {
  const [perm, setPerm] = useState(notificationPermission());
  const updateTx = useTxStore((s) => s.updateTx);
  if (perm === "unsupported") return null;

  if (perm === "granted" && tx.notify) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-c2 px-1 mb-3">
        <BellRing size={13} className="text-accent" aria-hidden="true" />
        You&apos;ll get a browser notification while Vynera is open in a tab.
      </div>
    );
  }
  if (perm === "denied") {
    return (
      <p className="text-[12px] text-c3 px-1 mb-3">
        Notifications are blocked for this site. Status updates still appear here.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await requestNotificationPermission();
        setPerm(notificationPermission());
        if (ok) updateTx(tx.id, { notify: true });
      }}
      className="btn-ghost rounded-xl py-2.5 px-3 mb-3 text-[13px] flex items-center justify-center gap-2 w-full"
    >
      <Bell size={13} aria-hidden="true" /> Notify me when it arrives
    </button>
  );
}

// ─── StatusTimeline ───────────────────────────────────────────────────────────

interface StatusTimelineProps {
  onClose: () => void;
  onSendAnother: () => void;
  onSignLeg: (txId: string, legIndex: number) => void;
}

export function StatusTimeline({ onClose, onSendAnother, onSignLeg }: StatusTimelineProps) {
  const { activeTx, completeActiveTx } = useTxStore();

  const handleCloseDialog = useCallback(() => {
    // Moving to history doesn't stop tracking — the watcher follows history too
    const tx = useTxStore.getState().activeTx;
    if (tx && tx.phase !== "signing") completeActiveTx();
    onClose();
  }, [completeActiveTx, onClose]);

  const handleSendAnother = useCallback(() => {
    completeActiveTx();
    onSendAnother();
  }, [completeActiveTx, onSendAnother]);

  const tx = activeTx;
  if (!tx) return null;

  const legs = txLegs(tx);
  const from = tx.from ?? legs[0].from;
  const to = tx.to ?? legs[legs.length - 1].to;
  const isComplete = tx.phase === "delivered" || tx.phase === "executed";
  const isError = tx.phase === "error";
  const signIndex = nextLegToSign(tx);
  const needsSignature = tx.phase === "awaitingNextLeg" && signIndex > 0;
  const errorLeg = legs.findIndex((l) => l.phase === "error");
  const canRetry = isError && errorLeg >= 0 && !legs[errorLeg].hash;

  const doneLegs = legs.filter((l) => l.phase === "delivered").length;
  const inLegProgress = legs.some((l) => l.phase === "inFlight") ? 0.6 : legs.some((l) => ["submitted", "inBlock"].includes(l.phase)) ? 0.3 : 0.1;
  const progressPct = isComplete ? 100 : Math.min(95, ((doneLegs + inLegProgress) / legs.length) * 100);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: "var(--modal-backdrop)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
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
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" /> Delivered
                    </span>
                  ) : isError ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-c2 font-medium">
                      <AlertCircle size={11} aria-hidden="true" /> Error
                    </span>
                  ) : needsSignature ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-warning font-medium">
                      <PenLine size={11} aria-hidden="true" /> Action needed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-c2 font-medium">
                      <Spinner size={11} /> In progress
                    </span>
                  )}
                </div>
                <h2 id="status-title" className="text-c1 text-lg font-semibold tracking-tight">
                  {isComplete
                    ? "Funds delivered"
                    : isError
                      ? "Transfer failed"
                      : needsSignature
                        ? `Sign step ${signIndex + 1}`
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

            {isError && (
              <div className="surface-2 rounded-2xl p-4 mb-4 text-center">
                <p className="text-c1 font-medium">{tx.error ?? "Transaction failed"}</p>
                <p className="text-c2 text-sm mt-1">
                  {errorLeg > 0
                    ? `Step 1 already delivered your funds to ${CHAIN_LABEL[legs[errorLeg].from]} — they are safe there.`
                    : canRetry
                      ? "Your funds were not moved."
                      : "Check the explorer link below for details."}
                </p>
              </div>
            )}

            {/* Amount + Route */}
            <div className="surface-2 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-c3">Amount</div>
                  <div className="text-c1 font-mono font-medium text-lg">
                    {formatAI3(BigInt(tx.amount), 4)} <span className="text-c3 text-xs">{CHAIN_TOKEN[from]}</span>
                  </div>
                </div>
                {tx.fee && (
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-c3">Platform fee</div>
                    <div className="text-c2 font-mono text-sm">{formatAI3(BigInt(tx.fee.total), 4)} AI3</div>
                  </div>
                )}
              </div>
              <RouteVisual
                fromChain={from}
                toChain={to}
                fromAddr={shortAddr(from, tx.fromAddress)}
                toAddr={shortAddr(to, tx.toAddress)}
                animated={!isComplete && !isError}
              />
            </div>

            {/* Progress bar */}
            {!isError && (
              <div className="mb-3">
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
                    style={{ background: "linear-gradient(90deg, #6E3AFF 0%, #8A5DFF 60%, #6E3AFF 100%)" }}
                  />
                </div>
              </div>
            )}

            {/* Legs */}
            <div className="flex flex-col gap-0.5 mb-3">
              {legs.map((leg, i) => (
                <LegRow key={`${leg.kind}-${i}`} leg={leg} index={i} total={legs.length} />
              ))}
            </div>

            {!isComplete && !isError && <NotifyButton tx={tx} />}

            {/* Actions */}
            <div className="mt-auto flex gap-2">
              {needsSignature || canRetry ? (
                <>
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    className="btn-ghost rounded-xl py-3 px-4 flex-1 text-sm font-medium"
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    onClick={() => onSignLeg(tx.id, needsSignature ? signIndex : errorLeg)}
                    className="btn-accent rounded-xl py-3 px-4 flex-[2] text-sm font-medium text-white flex items-center justify-center gap-2"
                  >
                    <PenLine size={14} aria-hidden="true" />
                    {needsSignature ? `Sign step ${signIndex + 1}` : "Try again"}
                  </button>
                </>
              ) : isComplete || isError ? (
                <button
                  type="button"
                  onClick={handleSendAnother}
                  className="btn-accent rounded-xl py-3 px-4 w-full text-sm font-medium text-white"
                >
                  Send another
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCloseDialog}
                  className="btn-ghost rounded-xl py-3 px-4 w-full text-sm font-medium"
                >
                  Run in background
                </button>
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
              <h2 className="text-c1 text-lg font-semibold tracking-tight">Waiting for signature</h2>
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
                  style={{ background: "radial-gradient(circle, rgba(110,58,255,0.4) 0%, rgba(110,58,255,0) 70%)" }}
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
            <button type="button" onClick={onCancel} className="btn-ghost rounded-xl py-3 text-sm font-medium">
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
