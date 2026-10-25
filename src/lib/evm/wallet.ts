import { CHAINS } from "@/lib/constants";

export type EvmWalletName = string;

export interface EvmConnection {
  address: string;
  walletName: EvmWalletName;
}

export type EthProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  request: <T = unknown>(args: { method: string; params?: unknown[] }) => Promise<T>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

// ─── EIP-6963 multi-wallet discovery ─────────────────────────────────────────
// With several wallets installed, window.ethereum belongs to whichever injected
// last. EIP-6963 lets each wallet announce itself so the user can pick one.

export interface DiscoveredWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: EthProvider;
}

const discovered = new Map<string, DiscoveredWallet>();
const SELECTED_KEY = "xdm-evm-wallet-rdns";
let listening = false;

function startDiscovery(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const { info, provider } = (e as CustomEvent<{ info: Omit<DiscoveredWallet, "provider">; provider: EthProvider }>).detail;
    if (info?.rdns && provider) discovered.set(info.rdns, { ...info, provider });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Wallets that announced themselves; give them a moment after page load. */
export async function discoverEvmWallets(waitMs = 300): Promise<DiscoveredWallet[]> {
  startDiscovery();
  await new Promise((r) => setTimeout(r, waitMs));
  return [...discovered.values()];
}

export function selectEvmWallet(rdns: string | null): void {
  try {
    if (rdns) localStorage.setItem(SELECTED_KEY, rdns);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // storage unavailable
  }
}

function selectedRdns(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function getEthProvider(): EthProvider | null {
  if (typeof window === "undefined") return null;
  startDiscovery();
  const rdns = selectedRdns();
  const chosen = rdns ? discovered.get(rdns) : undefined;
  if (chosen) return chosen.provider;
  return (window as Window & { ethereum?: EthProvider }).ethereum ?? null;
}

export function isEvmAvailable(): boolean {
  return !!getEthProvider();
}

export function detectEvmWalletName(): EvmWalletName {
  const rdns = selectedRdns();
  const chosen = rdns ? discovered.get(rdns) : undefined;
  if (chosen) return chosen.name;
  const eth = getEthProvider();
  if (!eth) return "EVM Wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isMetaMask) return "MetaMask";
  return "EVM Wallet";
}

export async function connectEvmWallet(rdns?: string): Promise<EvmConnection> {
  if (rdns !== undefined) selectEvmWallet(rdns);
  const eth = getEthProvider();
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask, Rabby or SubWallet.");
  const accounts = await eth.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("No accounts returned from wallet.");
  return { address: accounts[0], walletName: detectEvmWalletName() };
}

export async function getConnectedEvmAccount(): Promise<string | null> {
  const eth = getEthProvider();
  if (!eth) return null;
  try {
    const accounts = await eth.request<string[]>({ method: "eth_accounts" });
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

export function onEvmAccountsChanged(handler: (accounts: string[]) => void): () => void {
  const eth = getEthProvider();
  if (!eth?.on) return () => {};
  const wrapped = (accounts: unknown) => handler(accounts as string[]);
  eth.on("accountsChanged", wrapped);
  return () => eth.removeListener?.("accountsChanged", wrapped);
}

/** Fetch native balance (wei = Shannons) for an EVM address. */
export async function getEvmBalance(address: string): Promise<bigint> {
  const eth = getEthProvider();
  if (!eth) throw new Error("No EVM wallet available");
  const hex = await eth.request<string>({ method: "eth_getBalance", params: [address, "latest"] });
  return BigInt(hex);
}

// ─── Chain switching ─────────────────────────────────────────────────────────

const ADD_CHAIN_PARAMS: Record<number, object> = {
  [CHAINS.Mainnet.evm.chainId]: {
    chainId: `0x${CHAINS.Mainnet.evm.chainId.toString(16)}`,
    chainName: "Autonomys Auto EVM",
    rpcUrls: [CHAINS.Mainnet.evm.httpRpc],
    nativeCurrency: { name: "AI3", symbol: "AI3", decimals: 18 },
    blockExplorerUrls: [CHAINS.Mainnet.evm.explorerBase],
  },
};

/** Switch the wallet to `chainId` (adding Auto EVM if missing) and confirm it switched. */
export async function ensureChain(chainId: number): Promise<EthProvider> {
  const eth = getEthProvider();
  if (!eth) throw new Error("No EVM wallet available");
  const hex = `0x${chainId.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err: unknown) {
    const add = ADD_CHAIN_PARAMS[chainId];
    if ((err as { code?: number }).code === 4902 && add) {
      await eth.request({ method: "wallet_addEthereumChain", params: [add] });
    } else {
      throw err;
    }
  }
  // Some wallets resolve the switch request without actually switching.
  const active = parseInt(await eth.request<string>({ method: "eth_chainId" }), 16);
  if (active !== chainId) throw new Error(`Wallet is on chain ${active}, expected ${chainId}`);
  return eth;
}

// ─── Read-only JSON-RPC (independent of the wallet) ──────────────────────────

export async function jsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = (await res.json()) as { result?: T; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? `${method} failed`);
  return data.result as T;
}

export function ethCall(url: string, to: string, data: string): Promise<string> {
  return jsonRpc<string>(url, "eth_call", [{ to, data }, "latest"]);
}

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
}

export interface EvmReceipt {
  status: string;
  blockNumber: string;
  from: string;
  to: string | null;
  logs: EvmLog[];
}

/** Poll for a receipt via our own RPC (not the wallet), up to `timeoutMs`. */
export async function waitForReceipt(
  url: string,
  txHash: string,
  { timeoutMs = 10 * 60_000, intervalMs = 3000, isCancelled = () => false } = {}
): Promise<EvmReceipt | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !isCancelled()) {
    try {
      const receipt = await jsonRpc<EvmReceipt | null>(url, "eth_getTransactionReceipt", [txHash]);
      if (receipt) return receipt;
    } catch {
      // transient RPC error — retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
