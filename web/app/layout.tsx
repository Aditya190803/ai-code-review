import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-review.adityamer.dev"),
  title: "AI Code Review CLI — Terminal-Native AI Code Reviewer",
  description:
    "Catch bugs, security issues, and anti-patterns before you commit. AI-powered code review in the terminal with support for 8 providers, 10 languages, and 9 programming languages. Built with Bun, React, Ink, and the Vercel AI SDK.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "AI Code Review CLI",
    description:
      "AI-powered code review directly in your terminal. Supports OpenAI, Anthropic, Gemini, and more.",
    type: "website",
    url: "https://ai-review.adityamer.dev",
    siteName: "AI Code Review CLI",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Code Review CLI",
    description:
      "Terminal-native AI code review with support for 8 providers and 9 programming languages.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
