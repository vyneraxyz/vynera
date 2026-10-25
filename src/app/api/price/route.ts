// AI3 → USD for display only. Fetched server-side so the browser talks to no
// third party; cached for a minute to stay well inside CoinGecko's free limits.

export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=autonomys-network&vs_currencies=usd",
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }
    );
    const data = (await res.json()) as { "autonomys-network"?: { usd?: number } };
    const usd = data["autonomys-network"]?.usd;
    if (typeof usd !== "number") return Response.json({ usd: null }, { status: 502 });
    return Response.json({ usd });
  } catch {
    return Response.json({ usd: null }, { status: 502 });
  }
}
