"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, AlertCircle, AlertTriangle, BookUser, Info, Star, Trash2 } from "lucide-react";
import {
  addAddress,
  findSaved,
  kindFor,
  loadAddressBook,
  recentRecipients,
  removeAddress,
  type SavedAddress,
} from "@/lib/addressBook";
import { toAutonomysAddress, truncateAddress, validateRecipient, type RecipientNotice } from "@/lib/autonomys/addresses";
import { allTransfers } from "@/store/transactions";
import type { Chain } from "@/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  targetChain: Chain;
  /** Extra context about a valid recipient (own wallet, treasury, …) */
  notice?: RecipientNotice | null;
  disabled?: boolean;
}

export function RecipientInput({ value, onChange, targetChain, notice, disabled }: Props) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [book, setBook] = useState<SavedAddress[]>([]);
  const [bookOpen, setBookOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");

  // localStorage is only readable after mount
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setBook(loadAddressBook()), []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  const validation = validateRecipient(debounced, targetChain);
  // Only show the notice once it describes what's actually typed
  const shownNotice = validation.state === "valid" && debounced === value ? notice : null;
  const expectsEvm = targetChain !== "consensus";
  const placeholder = expectsEvm ? "0x…" : "su…";
  const defaultHelper = expectsEvm
    ? "EVM address expected (0x…)"
    : "Substrate SS58 address expected";

  const kind = kindFor(targetChain);
  const saved = validation.state === "valid" ? findSaved(book, debounced, targetChain) : undefined;
  const entries = book.filter((e) => e.kind === kind);
  const recents = bookOpen
    ? recentRecipients(allTransfers(), targetChain).filter((a) => !findSaved(book, a, targetChain))
    : [];
  const display = (a: string) => (kind === "substrate" ? toAutonomysAddress(a) : a);

  const pick = (a: string) => {
    onChange(display(a));
    setBookOpen(false);
  };

  const inputClass =
    "input w-full rounded-xl px-3.5 py-3.5 pr-10 font-mono text-sm " +
    (validation.state === "valid"
      ? "valid"
      : validation.state === "invalid"
        ? "invalid"
        : "");

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="flex items-center justify-between ml-1">
        <label htmlFor="recipient-input" className="text-[11px] uppercase tracking-wider text-c3">
          Recipient
          {saved && <span className="normal-case tracking-normal text-accent ml-1.5">· {saved.label}</span>}
        </label>
        <div className="flex items-center gap-1">
          {validation.state === "valid" && !saved && (
            <button
              type="button"
              onClick={() => setSaving((v) => !v)}
              className="btn-ghost rounded-md px-1.5 py-0.5 text-[11px] text-c3 flex items-center gap-1"
              aria-expanded={saving}
            >
              <Star size={11} /> Save
            </button>
          )}
          <button
            type="button"
            onClick={() => setBookOpen((v) => !v)}
            className="btn-ghost rounded-md px-1.5 py-0.5 text-[11px] text-c3 flex items-center gap-1"
            aria-expanded={bookOpen}
            aria-controls="address-book"
          >
            <BookUser size={11} /> Address book
          </button>
        </div>
      </div>

      {saving && validation.state === "valid" && !saved && (
        <form
          className="mt-1.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBook(addAddress({ label, address: debounced.trim(), kind }));
            setSaving(false);
            setLabel("");
          }}
        >
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. My Consensus wallet"
            maxLength={40}
            className="input flex-1 rounded-lg px-3 py-2 text-sm"
            aria-label="Label for this address"
          />
          <button type="submit" className="btn-accent rounded-lg px-3 text-sm text-white">
            Save
          </button>
        </form>
      )}

      {bookOpen && (
        <div id="address-book" className="mt-1.5 surface-2 rounded-xl p-1 max-h-60 overflow-auto">
          {entries.length === 0 && recents.length === 0 && (
            <p className="text-[12px] text-c3 px-2 py-2">
              No saved {kind === "substrate" ? "Consensus" : "EVM"} addresses yet. Enter one and press Save.
            </p>
          )}
          {entries.map((e) => (
            <div key={e.address} className="flex items-center gap-2 rounded-lg hover:bg-white/[0.04]">
              <button type="button" onClick={() => pick(e.address)} className="flex-1 text-left px-2 py-1.5 min-w-0">
                <div className="text-sm text-c1 truncate">{e.label}</div>
                <div className="text-[11px] font-mono text-c3">{truncateAddress(display(e.address), 8, 6)}</div>
              </button>
              <button
                type="button"
                onClick={() => setBook(removeAddress(e.address, e.kind))}
                className="btn-ghost rounded-md p-1.5 mr-1 text-c3"
                aria-label={`Remove ${e.label}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {recents.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-c3 px-2 pt-2 pb-1">Recent</div>
              {recents.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => pick(a)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.04] text-[12px] font-mono text-c2"
                >
                  {truncateAddress(display(a), 10, 8)}
                </button>
              ))}
            </>
          )}
        </div>
      )}

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
        role={shownNotice?.level === "warning" ? "alert" : undefined}
        className={`text-[11.5px] mt-1.5 ml-1 flex items-center gap-1.5 ${
          shownNotice?.level === "warning"
            ? "text-warning"
            : validation.state === "valid"
              ? "text-accent"
              : validation.state === "invalid"
                ? "text-c1"
                : "text-c3"
        }`}
      >
        {shownNotice?.level === "warning" ? (
          <AlertTriangle size={12} className="shrink-0" />
        ) : validation.state === "invalid" ? (
          <AlertCircle size={12} />
        ) : validation.state === "valid" ? null : (
          <Info size={12} />
        )}
        <span>
          {validation.state === "idle"
            ? defaultHelper
            : shownNotice
              ? `${validation.message} · ${shownNotice.message}`
              : validation.message}
        </span>
      </div>
    </div>
  );
}
