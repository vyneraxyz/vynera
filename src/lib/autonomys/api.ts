import type { ApiPromise } from "@autonomys/auto-utils";
import { createConnection } from "@autonomys/auto-utils";
import { CHAINS } from "@/lib/constants";

const cache = new Map<string, Promise<ApiPromise>>();

/** Pinned genesis hash for each known RPC URL. */
const EXPECTED_GENESIS: Record<string, string> = Object.fromEntries(
  Object.values(CHAINS).flatMap((c) => [
    [c.consensus.rpc, c.consensus.genesisHash],
    [c.evm.rpc, c.evm.genesisHash],
  ])
);

/**
 * Return a cached ApiPromise singleton for the given RPC URL.
 * Rejects if the node reports a genesis hash other than the pinned one.
 */
export function getApi(rpcUrl: string): Promise<ApiPromise> {
  const existing = cache.get(rpcUrl);
  if (existing) return existing;

  const promise = createConnection(rpcUrl)
    .then(async (api) => {
      const expected = EXPECTED_GENESIS[rpcUrl];
      const actual = api.genesisHash.toHex();
      if (expected && actual !== expected) {
        await api.disconnect().catch(() => {});
        throw new Error(
          `RPC ${rpcUrl} serves an unexpected chain (genesis ${actual}). Refusing to continue.`
        );
      }
      return api;
    })
    .catch((err: unknown) => {
      cache.delete(rpcUrl);
      throw err;
    });

  cache.set(rpcUrl, promise);
  return promise;
}

/** Disconnect and evict a cached connection. Call on network switch. */
export async function disconnectApi(rpcUrl: string): Promise<void> {
  const existing = cache.get(rpcUrl);
  if (!existing) return;
  cache.delete(rpcUrl);
  try {
    const api = await existing;
    await api.disconnect();
  } catch {
    // already disconnected or never connected
  }
}

/** Disconnect all cached connections. */
export async function disconnectAll(): Promise<void> {
  const urls = [...cache.keys()];
  await Promise.allSettled(urls.map(disconnectApi));
}

/**
 * Fetch the latest finalized block number from a consensus API.
 * Returns -1 on error.
 */
export async function getFinalizedBlockNumber(api: ApiPromise): Promise<number> {
  try {
    const hash = await api.rpc.chain.getFinalizedHead();
    const header = await api.rpc.chain.getHeader(hash);
    return header.number.toNumber();
  } catch {
    return -1;
  }
}

/**
 * Assert that the connected chain's SS58 prefix and decimals match expectations.
 * Throws with a human-readable message if they don't.
 */
export async function assertChainProps(
  api: ApiPromise,
  expectedSS58: number,
  expectedDecimals: number
): Promise<void> {
  const props = await api.rpc.system.properties();
  const ss58 = props.ss58Format.unwrapOr(null)?.toNumber();
  const dec = props.tokenDecimals.unwrapOr(null)?.[0]?.toNumber();

  if (ss58 !== undefined && ss58 !== null && ss58 !== expectedSS58) {
    throw new Error(
      `Chain SS58 prefix mismatch: got ${ss58}, expected ${expectedSS58}`
    );
  }
  if (dec !== undefined && dec !== null && dec !== expectedDecimals) {
    throw new Error(
      `Chain decimals mismatch: got ${dec}, expected ${expectedDecimals}`
    );
  }
}
