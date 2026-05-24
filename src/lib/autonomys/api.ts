import type { ApiPromise } from "@autonomys/auto-utils";
import { createConnection } from "@autonomys/auto-utils";

const cache = new Map<string, Promise<ApiPromise>>();

/** Return a cached ApiPromise singleton for the given RPC URL. */
export function getApi(rpcUrl: string): Promise<ApiPromise> {
  const existing = cache.get(rpcUrl);
  if (existing) return existing;

  const promise = createConnection(rpcUrl).catch((err: unknown) => {
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
