"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { formatAI3, formatShannons, parseAI3 } from "@/lib/autonomys/amounts";
import { MIN_TRANSFER_SHANNONS } from "@/lib/constants";
import { formatUsd, useAi3Price } from "@/lib/price";

interface Props {
  value: string;
  onChange: (v: string) => void;
  balanceShannons: bigint;
  /** Fill a share of the spendable balance: 0.25, 0.5 or 1 (max) */
  onPreset: (fraction: 0.25 | 0.5 | 1) => void;
  /** Gas paid in the same token on the source chain (0 when gas is paid in ETH) */
  gasShannons: bigint;
  token?: string;
  disabled?: boolean;
}

const PRESETS = [
  { label: "25%", fraction: 0.25 },
  { label: "50%", fraction: 0.5 },
  { label: "Max", fraction: 1 },
] as const;

export function AmountInput({ value, onChange, balanceShannons, onPreset, gasShannons, token = "AI3", disabled }: Props) {
  const usd = useAi3Price();
  const parsed = parseAI3(value);
  const belowMin = parsed !== null && parsed > 0n && parsed < MIN_TRANSFER_SHANNONS;
  const insufficient =
    parsed !== null &&
    parsed > 0n &&
    parsed + gasShannons > balanceShannons;
  const usdValue = parsed !== null ? formatUsd(parsed, usd) : null;

  const hasError = belowMin || insufficient;

  const prettyShannons = (() => {
    if (parsed === null || parsed <= 0n) return "0 Shannons";
    return formatShannons(parsed);
  })();

  return (
    <div className={`w-full ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between ml-1 mb-1.5">
        <label htmlFor="amount-input" className="text-[11px] uppercase tracking-wider text-c3">
          Amount
        </label>
        <span className="text-[11px] text-c3">
          Balance:{" "}
          <span className="font-mono text-c2">{formatAI3(balanceShannons, 4)} {token}</span>
        </span>
      </div>

      <div
        className={`input w-full rounded-xl px-4 py-3.5 flex items-center gap-3 overflow-hidden ${hasError ? "invalid" : ""}`}
      >
        <input
          id="amount-input"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 20) return;
            if (v === "" || /^\d{0,13}(\.\d{0,6})?$/.test(v)) onChange(v);
          }}
          placeholder="0.00"
          aria-label="Amount in AI3"
          aria-describedby="amount-helper"
          aria-invalid={hasError}
          className="bg-transparent outline-none min-w-0 w-0 flex-1 text-2xl font-mono font-medium tabular-nums text-c1"
        />

        <AnimatePresence>
          {value && (
            <motion.button
              type="button"
              onClick={() => onChange("")}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="flex items-center justify-center rounded-full shrink-0 cursor-pointer"
              style={{
                width: 22,
                height: 22,
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.9)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.32)",
              }}
              aria-label="Clear amount"
            >
              <X size={14} strokeWidth={2} />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="text-c1 font-medium font-mono text-sm pl-1 shrink-0">{token}</div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(p.fraction)}
            className="btn-ghost rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
            aria-label={p.fraction === 1 ? "Set maximum amount" : `Set ${p.label} of balance`}
          >
            {p.label}
          </button>
        ))}
        {usdValue && <span className="ml-auto text-[12px] text-c2 font-mono">≈ {usdValue}</span>}
      </div>

      <div id="amount-helper" className="mt-1.5 ml-1 flex items-center justify-between">
        <span className="text-[11px] text-c3 font-mono">{prettyShannons}</span>

        <AnimatePresence>
          {belowMin && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11.5px] text-c1 flex items-center gap-1.5"
              role="alert"
            >
              <AlertCircle size={12} />
              Minimum 1 AI3
            </motion.span>
          )}
          {!belowMin && insufficient && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11.5px] text-c1 flex items-center gap-1.5"
              role="alert"
            >
              <AlertCircle size={12} />
              Insufficient balance
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
