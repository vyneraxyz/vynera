"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { formatAI3, formatShannons, parseAI3 } from "@/lib/autonomys/amounts";
import { MIN_TRANSFER_SHANNONS, NETWORK_FEE_SHANNONS } from "@/lib/constants";

interface Props {
  value: string;
  onChange: (v: string) => void;
  balanceShannons: bigint;
  onMax: () => void;
  disabled?: boolean;
}

export function AmountInput({ value, onChange, balanceShannons, onMax, disabled }: Props) {
  const parsed = parseAI3(value);
  const belowMin = parsed !== null && parsed > 0n && parsed < MIN_TRANSFER_SHANNONS;
  const insufficient =
    parsed !== null &&
    parsed > 0n &&
    parsed + NETWORK_FEE_SHANNONS > balanceShannons;

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
          <span className="font-mono text-c2">{formatAI3(balanceShannons, 4)} AI3</span>
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

        <button
          onClick={onMax}
          type="button"
          className="btn-ghost rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider shrink-0"
          aria-label="Set maximum amount"
        >
          Max
        </button>

        <div className="text-c1 font-medium font-mono text-sm pl-1 shrink-0">AI3</div>
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
