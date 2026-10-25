export const DECIMALS = 18;
export const SHANNONS_PER_AI3 = 10n ** 18n;

/** Minimum reserve left in wallet after MAX (0.1 AI3 in Shannons) */
export const RESERVE_SHANNONS = 10n ** 17n;

/** Minimum amount the Transporter pallet accepts (1 AI3) */
export const MIN_TRANSFER_SHANNONS = 10n ** 18n;

export const BLOCK_TIME_SECONDS = 3;

export const TREASURY_SS58 = "subcfcaGG2VXuLoLjuHMCj4aeLPTFBtGUvTahGc6zLrsMSNVo";

export const CHAINS = {
  Mainnet: {
    consensus: {
      rpc: "wss://rpc.mainnet.autonomys.xyz/ws",
      /** Pinned so a hijacked or misconfigured RPC can't serve a different chain */
      genesisHash: "0x66455a580aabff303720aa83adbe6c44502922251c03ba73686d5245da9e21bd",
      networkId: "mainnet",
      ss58Prefix: 6094,
      decimals: 18,
      explorerBase: "https://autonomys.subscan.io",
    },
    evm: {
      rpc: "wss://auto-evm.mainnet.autonomys.xyz/ws",
      genesisHash: "0xdb98c50e9ab1c34fe7927d97373f82e3c0d11490813a7c0b8dac2cd9a793a7dd",
      /** HTTP JSON-RPC endpoint for direct eth_getBalance queries */
      // The node serves HTTP JSON-RPC on the /ws path; the bare root returns 404
      httpRpc: "https://auto-evm.mainnet.autonomys.xyz/ws",
      networkId: "mainnet",
      domainId: 0,
      chainId: 870,
      decimals: 18,
      explorerBase: "https://explorer.auto-evm.mainnet.autonomys.xyz",
    },
    ethereum: {
      chainId: 1,
      httpRpc: "https://ethereum-rpc.publicnode.com",
      explorerBase: "https://etherscan.io",
    },
  },
} as const;

/**
 * Hyperlane warp route for AI3: native AI3 is locked in HypNative on Auto EVM,
 * WAI3 is minted/burned by the synthetic router on Ethereum. One Mailbox
 * address is deployed on both chains.
 */
export const HYPERLANE = {
  mailbox: "0xA1382A17C25EDa9761A98fCfE82a105f337AeED2",
  domain: { evm: 870, ethereum: 1 },
  router: {
    evm: "0x38ED676d20C9b026A2372D3A88a0bcEE54de3851",
    ethereum: "0x363fca95f23e10c76ef793d62d92d39e89d83ac1",
  },
} as const;

export const NETWORK_FEE_AI3 = 0.001;
export const NETWORK_FEE_SHANNONS = BigInt(
  Math.round(NETWORK_FEE_AI3 * 1e12)
) * 10n ** 6n;
