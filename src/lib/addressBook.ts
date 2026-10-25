import { isValidEthereumAddress, isValidSubstrateAddress, samePublicKey } from "@/lib/autonomys/addresses";
import type { Chain, StoredTx } from "@/types";

// Saved recipients live in this browser only (localStorage).

export interface SavedAddress {
  label: string;
  address: string;
  /** "substrate" works on Consensus; "evm" on Auto EVM and Ethereum */
  kind: "substrate" | "evm";
}

const KEY = "vynera-address-book";

export function kindFor(chain: Chain): SavedAddress["kind"] {
  return chain === "consensus" ? "substrate" : "evm";
}

function same(a: string, b: string, kind: SavedAddress["kind"]): boolean {
  return kind === "evm" ? a.toLowerCase() === b.toLowerCase() : samePublicKey(a, b);
}

export function loadAddressBook(): SavedAddress[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAddress[]) : [];
    return list.filter((e) => e && typeof e.address === "string" && typeof e.label === "string");
  } catch {
    return [];
  }
}

function save(list: SavedAddress[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable
  }
}

export function addAddress(entry: SavedAddress): SavedAddress[] {
  const valid = entry.kind === "evm" ? isValidEthereumAddress(entry.address) : isValidSubstrateAddress(entry.address);
  if (!valid) return loadAddressBook();
  const list = loadAddressBook().filter((e) => !(e.kind === entry.kind && same(e.address, entry.address, e.kind)));
  const next = [{ ...entry, label: entry.label.trim().slice(0, 40) || "Saved" }, ...list].slice(0, 50);
  save(next);
  return next;
}

export function removeAddress(address: string, kind: SavedAddress["kind"]): SavedAddress[] {
  const next = loadAddressBook().filter((e) => !(e.kind === kind && same(e.address, address, kind)));
  save(next);
  return next;
}

export function findSaved(list: SavedAddress[], address: string, chain: Chain): SavedAddress | undefined {
  const kind = kindFor(chain);
  return list.find((e) => e.kind === kind && same(e.address, address, kind));
}

/** Distinct recent recipients for `chain` from transfer history, newest first */
export function recentRecipients(history: StoredTx[], chain: Chain, limit = 5): string[] {
  const kind = kindFor(chain);
  const out: string[] = [];
  for (const tx of history) {
    const to = tx.to ?? (tx.direction === "c2e" ? "evm" : "consensus");
    if (kindFor(to) !== kind || !tx.toAddress) continue;
    if (!out.some((a) => same(a, tx.toAddress, kind))) out.push(tx.toAddress);
    if (out.length >= limit) break;
  }
  return out;
}
