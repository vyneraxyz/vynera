"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Shield, ChevronDown, ArrowRight } from "lucide-react";
import { parseAI3, formatAI3 } from "@/lib/autonomys/amounts";
import { NETWORK_FEE_SHANNONS, PLATFORM_FEE_BPS, challengeBlocks, challengeHint } from "@/lib/constants";
import type { Direction } from "@/types";

interface Props {
  amount: string;
  direction: Direction;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function Row({
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

export function SummaryCard({ amount, direction, expanded, onToggle, disabled }: Props) {
  const parsed = parseAI3(amount);
  const total = parsed !== null ? parsed + NETWORK_FEE_SHANNONS : NETWORK_FEE_SHANNONS;

  return (
    <div
      className={`surface-2 rounded-2xl ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3"
        aria-expanded={expanded}
        aria-controls="summary-details"
      >
        <div className="flex items-center gap-2 text-sm">
          <Shield size={14} className="text-c3" />
          <span className="text-c2">Transaction summary</span>
        </div>
        <div className="flex items-center gap-2 text-c2 text-xs">
          <span className="font-mono">{formatAI3(total, 4)} AI3</span>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="inline-block"
          >
            <ChevronDown size={14} />
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="summary-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 -mt-1 grid gap-2 text-sm">
              <div style={{ borderTop: "1px solid var(--border-1)" }} />

              <Row
                label="Network fee"
                value={
                  <span className="font-mono">{formatAI3(NETWORK_FEE_SHANNONS, 4)} AI3</span>
                }
                hint="Source domain gas"
              />

              {direction === "c2e" ? (
                <Row
                  label={<span className="text-c3">Platform fee ({PLATFORM_FEE_BPS / 100}%)</span>}
                  value={
                    parsed !== null
                      ? <span className="font-mono text-c3">{formatAI3((parsed * BigInt(PLATFORM_FEE_BPS)) / 10000n, 4)} AI3</span>
                      : <span className="text-c3">—</span>
                  }
                />
              ) : (
                <Row
                  label={<span className="text-c3">Platform fee</span>}
                  value={<span className="text-c3">free</span>}
                />
              )}

              <Row
                label="Challenge period"
                value={<span className="font-mono">{challengeBlocks(direction)} blocks</span>}
                hint={challengeHint(direction)}
              />

              <Row
                label="Route"
                value={
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    {direction === "c2e" ? "Consensus" : "Auto EVM"}
                    <ArrowRight size={12} className="text-c3" />
                    {direction === "c2e" ? "Auto EVM" : "Consensus"}
                  </span>
                }
              />

              <div style={{ borderTop: "1px solid var(--border-1)" }} />

              <Row
                label={<span className="text-c1 font-medium">Total deducted</span>}
                value={
                  <span className="text-c1 font-mono font-medium">
                    {formatAI3(total, 4)} AI3
                  </span>
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
