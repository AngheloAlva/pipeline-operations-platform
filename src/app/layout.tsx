import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./deck.css";
import { Header } from "@/components/layout/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pipeline Operations Platform",
  description: "Plataforma de operaciones de oleoductos — Panel de control y monitoreo",
};

/**
 * Inline script that reads localStorage("theme") BEFORE first paint to avoid
 * a flash of unstyled content (FOUC). Default is now DARK (control room).
 * Runs synchronously — must have a stable id (Next.js Script requirement).
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light') {
      // User explicitly chose light — honour it
      document.documentElement.classList.remove('dark');
    } else {
      // Default: dark (sala de control — no class === dark via :root default)
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline script mutates className before React
    // hydrates, so the server-rendered class and client class intentionally differ.
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* FOUC prevention — must be synchronous, before body content */}
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface-base text-text-primary antialiased">
        <Header />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
