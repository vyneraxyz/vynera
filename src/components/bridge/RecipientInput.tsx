"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, AlertCircle, Info } from "lucide-react";
import { validateRecipient } from "@/lib/autonomys/addresses";
import type { Chain } from "@/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  targetChain: Chain;
  disabled?: boolean;
}

export function RecipientInput({ value, onChange, targetChain, disabled }: Props) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  const validation = validateRecipient(debounced, targetChain);
  const expectsEvm = targetChain === "evm";
  const placeholder = expectsEvm ? "0x…" : "su…";
  const defaultHelper = expectsEvm
    ? "EVM address expected (0x…)"
    : "Substrate SS58 address expected";

  const inputClass =
    "input w-full rounded-xl px-3.5 py-3.5 pr-10 font-mono text-sm " +
    (validation.state === "valid"
      ? "valid"
      : validation.state === "invalid"
        ? "invalid"
        : "");

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <label
        htmlFor="recipient-input"
        className="text-[11px] uppercase tracking-wider text-c3 ml-1"
      >
        Recipient
      </label>
      <div className="mt-1.5 relative">
        <input
          id="recipient-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="recipient-helper"
          aria-invalid={validation.state === "invalid"}
          className={inputClass}
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          <AnimatePresence mode="wait">
            {validation.state === "valid" && (
              <motion.span
                key="valid"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="pop-in flex items-center justify-center rounded-full"
                style={{
                  width: 22,
                  height: 22,
                  background: "rgba(110,58,255,0.22)",
                  color: "#fff",
                  boxShadow:
                    "0 0 0 1px rgba(110,58,255,0.55), 0 0 16px -2px rgba(110,58,255,0.45)",
                }}
                aria-label="Valid address"
              >
                <Check size={14} strokeWidth={2} />
              </motion.span>
            )}
            {validation.state === "invalid" && (
              <motion.button
                key="invalid"
                type="button"
                onClick={() => onChange("")}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="pop-in flex items-center justify-center rounded-full cursor-pointer"
                style={{
                  width: 22,
                  height: 22,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.9)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.32)",
                }}
                aria-label="Clear address"
              >
                <X size={14} strokeWidth={2} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        id="recipient-helper"
        className={`text-[11.5px] mt-1.5 ml-1 flex items-center gap-1.5 ${
          validation.state === "valid"
            ? "text-accent"
            : validation.state === "invalid"
              ? "text-c1"
              : "text-c3"
        }`}
      >
        {validation.state === "invalid" ? (
          <AlertCircle size={12} />
        ) : validation.state === "valid" ? null : (
          <Info size={12} />
        )}
        <span>
          {validation.state === "idle"
            ? defaultHelper
            : validation.message}
        </span>
      </div>
    </div>
  );
}
