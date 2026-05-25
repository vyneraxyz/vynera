export const DECIMALS = 18;
export const SHANNONS_PER_AI3 = 10n ** 18n;

/** Minimum reserve left in wallet after MAX (0.1 AI3 in Shannons) */
export const RESERVE_SHANNONS = 10n ** 17n;

/** Minimum amount the Transporter pallet accepts (1 AI3) */
export const MIN_TRANSFER_SHANNONS = 10n ** 18n;

export const BLOCK_TIME_SECONDS = 3;

export const PLATFORM_FEE_BPS = 300; // 3%
export const TREASURY_SS58 = "subcfcaGG2VXuLoLjuHMCj4aeLPTFBtGUvTahGc6zLrsMSNVo";

/** Consensus → EVM: 100 consensus blocks (~10 min) */
export const C2E_CHALLENGE_BLOCKS = 100;
/** EVM → Consensus: 14 400 domain blocks (~30 h) */
export const E2C_CHALLENGE_BLOCKS = 14_400;

export function challengeBlocks(direction: "c2e" | "e2c"): number {
  return direction === "c2e" ? C2E_CHALLENGE_BLOCKS : E2C_CHALLENGE_BLOCKS;
}

export function challengeHint(direction: "c2e" | "e2c"): string {
  return direction === "c2e" ? "100 blocks · ~10 min" : "14 400 blocks · ~30 h";
}

export const CHAINS = {
  Mainnet: {
    consensus: {
      rpc: "wss://rpc.mainnet.autonomys.xyz/ws",
      networkId: "mainnet",
      ss58Prefix: 6094,
      decimals: 18,
      explorerBase: "https://autonomys.subscan.io",
    },
    evm: {
      rpc: "wss://auto-evm.mainnet.autonomys.xyz/ws",
      /** HTTP JSON-RPC endpoint for direct eth_getBalance queries */
      httpRpc: "https://auto-evm.mainnet.autonomys.xyz/",
      networkId: "mainnet",
      domainId: 0,
      chainId: 870,
      decimals: 18,
      explorerBase: "https://explorer.auto-evm.mainnet.autonomys.xyz",
    },
  },
  Testnet: {
    consensus: {
      rpc: "wss://rpc.taurus.autonomys.xyz/ws",
      networkId: "taurus",
      ss58Prefix: 6094,
      decimals: 18,
      explorerBase: "https://autonomys-taurus.subscan.io",
    },
    evm: {
      rpc: "wss://auto-evm.taurus.autonomys.xyz/ws",
      /** HTTP JSON-RPC endpoint for direct eth_getBalance queries */
      httpRpc: "https://auto-evm.taurus.autonomys.xyz/",
      networkId: "taurus",
      domainId: 0,
      chainId: 490000,
      decimals: 18,
      explorerBase: "https://explorer.auto-evm.taurus.autonomys.xyz",
    },
  },
} as const;

export const NETWORK_FEE_AI3 = 0.001;
export const NETWORK_FEE_SHANNONS = BigInt(
  Math.round(NETWORK_FEE_AI3 * 1e12)
) * 10n ** 6n;
