import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { AuthGate } from "@/components/auth-gate";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPaletteProvider } from "@/components/command-palette-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cool Paper",
  description: "Immersive arxiv paper reader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} antialiased`}
      >
        <ClerkProvider>
          <ConvexClientProvider>
            <AuthGate>
              <CommandPaletteProvider>
                {children}
                <MobileNav />
              </CommandPaletteProvider>
            </AuthGate>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
