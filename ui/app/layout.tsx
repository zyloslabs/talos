import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetBrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Talos Command Center",
  description: "Test Automation & Logic Orchestration System",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetBrains.variable} grid h-dvh overflow-hidden antialiased`}
      >
        <Providers>
          <main className="overflow-auto flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
