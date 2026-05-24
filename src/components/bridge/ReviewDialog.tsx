"use client";

import { motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3, formatShannons, parseAI3 } from "@/lib/autonomys/amounts";
import { NETWORK_FEE_SHANNONS, PLATFORM_FEE_BPS, challengeHint } from "@/lib/constants";
import type { Direction } from "@/types";
import { ChainBadge } from "./DirectionToggle";

interface Props {
  direction: Direction;
  amount: string;
  fromAddress: string;
  toAddress: string;
  platformFeeEnabled: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function RouteVisual({
  fromChain,
  toChain,
  fromAddr,
  toAddr,
  animated = false,
}: {
  fromChain: string;
  toChain: string;
  fromAddr: string;
  toAddr: string;
  animated?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col items-center text-center flex-1">
        <ChainBadge chain={fromChain} size="lg" />
        <div className="mt-2 text-[11px] uppercase tracking-wider text-c3">From</div>
        <div className="text-c1 text-sm font-medium">
          {fromChain === "consensus" ? "Consensus" : "Auto EVM"}
        </div>
        <div className="font-mono text-[11px] text-c3 mt-0.5">
          {truncateAddress(fromAddr, 6, 4)}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-2">
        <svg
          width="100%"
          height="36"
          viewBox="0 0 120 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="route-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#6E3AFF" stopOpacity="0.15" />
              <stop offset="60%" stopColor="#6E3AFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#6E3AFF" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M2 18 L118 18" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          <path
            d="M2 18 L118 18"
            stroke="url(#route-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            className={animated ? "arrow-flow" : ""}
          />
          <path
            d="M111 12 L118 18 L111 24"
            stroke="#6E3AFF"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="text-[10px] uppercase tracking-wider text-c3 mt-1">XDM</div>
      </div>

      <div className="flex flex-col items-center text-center flex-1">
        <ChainBadge chain={toChain} size="lg" />
        <div className="mt-2 text-[11px] uppercase tracking-wider text-c3">To</div>
        <div className="text-c1 text-sm font-medium">
          {toChain === "consensus" ? "Consensus" : "Auto EVM"}
        </div>
        <div className="font-mono text-[11px] text-c3 mt-0.5">
          {truncateAddress(toAddr, 6, 4)}
        </div>
      </div>
    </div>
  );
}

export { RouteVisual };

function SummaryRow({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-c2">{label}</div>
        {hint && <div className="text-c3 text-[11px]">{hint}</div>}
      </div>
      <div className="text-c1">{value}</div>
    </div>
  );
}

export function ReviewDialog({ direction, amount, fromAddress, toAddress, platformFeeEnabled, onConfirm, onClose }: Props) {
  const fromChain = direction === "c2e" ? "consensus" : "evm";
  const toChain = direction === "c2e" ? "evm" : "consensus";
  const parsed = parseAI3(amount) ?? 0n;
  const platformFeeShannons = platformFeeEnabled
    ? (parsed * BigInt(PLATFORM_FEE_BPS)) / 10000n
    : 0n;
  const netShannons = parsed - platformFeeShannons;
  const total = parsed + NETWORK_FEE_SHANNONS;
  const timeHint = direction === "c2e" ? "~10 min" : "~24 h";

  return (
    <>
      {/* Backdrop */}
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
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 flex items-center justify-center p-0 sm:p-4 pointer-events-none z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
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
              <h2 id="review-title" className="text-c1 text-lg font-semibold tracking-tight">
                Review transfer
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Amount + Route */}
            <div className="surface-2 rounded-2xl p-5 mb-4">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wider text-c3">You are sending</div>
                <div className="mt-1 text-4xl font-semibold font-mono tracking-tight text-c1">
                  {formatAI3(parsed, 4)}
                  <span className="text-c2 text-base font-medium ml-2">AI3</span>
                </div>
                <div className="text-c3 text-[11px] mt-1 font-mono">
                  ≈ {formatShannons(parsed)}
                </div>
              </div>
              <div className="mt-5">
                <RouteVisual
                  fromChain={fromChain}
                  toChain={toChain}
                  fromAddr={fromChain === "consensus" ? toAutonomysAddress(fromAddress) : fromAddress}
                  toAddr={toChain === "consensus" ? toAutonomysAddress(toAddress) : toAddress}
                />
              </div>
            </div>

            {/* Fee breakdown */}
            <div className="surface-2 rounded-2xl p-4 grid gap-2 text-sm mb-4">
              {platformFeeEnabled ? (
                <>
                  <SummaryRow
                    label="Recipient receives"
                    value={<span className="font-mono">{formatAI3(netShannons, 4)} AI3</span>}
                  />
                  <SummaryRow
                    label={<span className="text-c3">Platform fee ({PLATFORM_FEE_BPS / 100}%)</span>}
                    value={<span className="font-mono text-c3">{formatAI3(platformFeeShannons, 4)} AI3</span>}
                  />
                  <div style={{ borderTop: "1px solid var(--border-1)" }} />
                </>
              ) : (
                <>
                  <SummaryRow
                    label={<span className="text-c3">Platform fee</span>}
                    value={<span className="text-c3">free</span>}
                  />
                  <div style={{ borderTop: "1px solid var(--border-1)" }} />
                </>
              )}
              <SummaryRow
                label="Network fee"
                value={<span className="font-mono">{formatAI3(NETWORK_FEE_SHANNONS, 4)} AI3</span>}
              />
              <SummaryRow
                label="Challenge period"
                value={<span className="font-mono">{timeHint}</span>}
                hint={challengeHint(direction)}
              />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <SummaryRow
                label={<span className="text-c1 font-medium">Total deducted</span>}
                value={
                  <span className="text-c1 font-mono font-medium">
                    {formatAI3(total, 4)} AI3
                  </span>
                }
              />
            </div>

            {/* Info banner */}
            <div
              className="rounded-xl px-3 py-2.5 flex gap-2 items-start text-[12.5px] mb-5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-1)",
                color: "var(--text-2)",
              }}
            >
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Tokens become available on the destination after the challenge period completes.
                This is normal XDM behavior — it cannot be skipped.
              </span>
            </div>

            {/* Actions */}
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost rounded-xl py-3 px-4 flex-1 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="btn-accent rounded-xl py-3 px-4 flex-[2] text-sm font-medium text-white"
              >
                Confirm in wallet
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
