import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const DESCRIPTION =
  "Community-built cross-domain bridge for moving AI3 tokens between the Autonomys Consensus chain and Auto EVM domain.";

export const metadata: Metadata = {
  title: "Vynera | Cross-domain transfers",
  description: DESCRIPTION,
  keywords: ["Vynera", "Autonomys", "XDM", "bridge", "AI3", "blockchain", "Auto EVM"],
  openGraph: {
    title: "Vynera | Cross-domain transfers",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/vynera_logo_black.png", width: 783, height: 185, alt: "Vynera" }],
  },
  twitter: {
    card: "summary",
    title: "Vynera | Cross-domain transfers",
    description: DESCRIPTION,
    images: ["/vynera_logo_black.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Prevent theme flash: read localStorage before React paint */}
        <Script id="xdm-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('xdm-theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
