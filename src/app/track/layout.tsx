import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track a transfer | Vynera",
  description: "Check where your AI3 is: XDM and Hyperlane transfers between Consensus, Auto EVM and Ethereum.",
};

export default function TrackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
