import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { MobileNav } from "@/components/mobile-nav";
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
        <ConvexClientProvider>
          {children}
          <MobileNav />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
