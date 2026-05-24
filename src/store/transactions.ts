"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredTx, TxPhase } from "@/types";

const STORAGE_KEY = "xdm-transactions";

interface TxState {
  activeTx: StoredTx | null;
  history: StoredTx[];

  setActiveTx: (tx: StoredTx) => void;
  updateActiveTxPhase: (
    phase: TxPhase,
    extra?: Partial<Pick<StoredTx, "hash" | "error" | "challengeStartBlock" | "challengeCurrentBlock" | "finalizedBlock" | "challengeStartTime">>
  ) => void;
  completeActiveTx: () => void;
  clearActiveTx: () => void;
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

      completeActiveTx: () => {
        const current = get().activeTx;
        if (!current) return;
        set((state) => ({
          activeTx: null,
          history: [current, ...state.history].slice(0, 50),
        }));
      },

      clearActiveTx: () => set({ activeTx: null }),
    }),
    {
      name: STORAGE_KEY,
      // BigInt serialization: store as string
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
