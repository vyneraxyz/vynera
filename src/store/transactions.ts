"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredLeg, StoredTx, TxPhase } from "@/types";

const STORAGE_KEY = "xdm-transactions";

interface TxState {
  activeTx: StoredTx | null;
  history: StoredTx[];

  setActiveTx: (tx: StoredTx) => void;
  updateActiveTxPhase: (
    phase: TxPhase,
    extra?: Partial<Pick<StoredTx, "hash" | "error" | "challengeStartBlock" | "challengeCurrentBlock" | "finalizedBlock" | "challengeStartTime">>
  ) => void;
  /** Patch a transfer wherever it lives (active or history) */
  updateTx: (id: string, patch: Partial<StoredTx>) => void;
  updateLeg: (id: string, legIndex: number, patch: Partial<StoredLeg>) => void;
  /** Bring a transfer from history back as the active one (e.g. to sign its next leg) */
  activate: (id: string) => void;
  completeActiveTx: () => void;
  clearActiveTx: () => void;
}

function patchTx(tx: StoredTx | null, id: string, fn: (t: StoredTx) => StoredTx): StoredTx | null {
  return tx && tx.id === id ? fn(tx) : tx;
}

export const useTxStore = create<TxState>()(
  persist(
    (set, get) => ({
      activeTx: null,
      history: [],

      setActiveTx: (tx) => set({ activeTx: tx }),

      updateActiveTxPhase: (phase, extra = {}) => {
        const current = get().activeTx;
        if (!current) return;
        set({ activeTx: { ...current, phase, ...extra } });
      },

      updateTx: (id, patch) => {
        const fn = (t: StoredTx) => ({ ...t, ...patch });
        set((s) => ({
          activeTx: patchTx(s.activeTx, id, fn),
          history: s.history.map((t) => (t.id === id ? fn(t) : t)),
        }));
      },

      updateLeg: (id, legIndex, patch) => {
        const fn = (t: StoredTx) => ({
          ...t,
          legs: t.legs?.map((l, i) => (i === legIndex ? { ...l, ...patch } : l)),
        });
        set((s) => ({
          activeTx: patchTx(s.activeTx, id, fn),
          history: s.history.map((t) => (t.id === id ? fn(t) : t)),
        }));
      },

      activate: (id) => {
        const s = get();
        if (s.activeTx?.id === id) return;
        const tx = s.history.find((t) => t.id === id);
        if (!tx) return;
        set({
          activeTx: tx,
          history: [...(s.activeTx ? [s.activeTx] : []), ...s.history.filter((t) => t.id !== id)],
        });
      },

      completeActiveTx: () => {
        const current = get().activeTx;
        if (!current) return;
        set((state) => ({
          activeTx: null,
          history: [current, ...state.history.filter((t) => t.id !== current.id)].slice(0, 50),
        }));
      },

      clearActiveTx: () => set({ activeTx: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: {
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name);
            if (!raw) return null;
            return JSON.parse(raw) as ReturnType<typeof JSON.parse>;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // storage unavailable
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // storage unavailable
          }
        },
      },
    }
  )
);

/** All stored transfers, active first */
export function allTransfers(): StoredTx[] {
  const { activeTx, history } = useTxStore.getState();
  return activeTx ? [activeTx, ...history.filter((t) => t.id !== activeTx.id)] : history;
}
