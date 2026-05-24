export type EvmWalletName = "MetaMask" | "Rabby" | "EVM Wallet";

export interface EvmConnection {
  address: string;
  walletName: EvmWalletName;
}

type EthProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  request: <T = unknown>(args: { method: string; params?: unknown[] }) => Promise<T>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getEth(): EthProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthProvider }).ethereum ?? null;
}

export function isEvmAvailable(): boolean {
  return typeof window !== "undefined" && !!getEth();
}

export function detectEvmWalletName(): EvmWalletName {
  const eth = getEth();
  if (!eth) return "EVM Wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isMetaMask) return "MetaMask";
  return "EVM Wallet";
}

export async function connectEvmWallet(): Promise<EvmConnection> {
  const eth = getEth();
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask or Rabby.");
  const accounts = await eth.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("No accounts returned from wallet.");
  return { address: accounts[0], walletName: detectEvmWalletName() };
}

export async function getConnectedEvmAccount(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const eth = getEth();
  if (!eth) return null;
  try {
    const accounts = await eth.request<string[]>({ method: "eth_accounts" });
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

export function onEvmAccountsChanged(handler: (accounts: string[]) => void): () => void {
  const eth = getEth();
  if (!eth) return () => {};
  const wrapped = (accounts: unknown) => handler(accounts as string[]);
  eth.on("accountsChanged", wrapped);
  return () => eth.removeListener("accountsChanged", wrapped);
}

/** Fetch native balance (wei = Shannons) for an EVM address. */
export async function getEvmBalance(address: string): Promise<bigint> {
  const eth = getEth();
  if (!eth) throw new Error("No EVM wallet available");
  const hex = await eth.request<string>({ method: "eth_getBalance", params: [address, "latest"] });
  return BigInt(hex);
}
