import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Treasury | Vynera",
  robots: { index: false, follow: false },
};

export default function TreasuryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
