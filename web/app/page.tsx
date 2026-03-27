"use client";

import React, { useEffect, useRef, useState } from "react";
import { GithubIcon } from "./components/GithubIcon";
import { TerminalDemo } from "./components/TerminalDemo";
import { motion } from "framer-motion";
import { Terminal, Copy, Check, Sparkles, Code2, BrainCircuit, Shield } from "lucide-react";

const PROVIDERS = ['OpenAI', 'Anthropic', 'Gemini', 'Mistral', 'Groq', 'NVIDIA NIM', 'Together', 'Cerebras', 'OpenRouter', 'xAI'];

function LogoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className}>
      <defs>
        <linearGradient id="logo-grad-main" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fcd34d" />
        </linearGradient>
      </defs>
      <path d="M140 160 L280 256 L140 352" fill="none" stroke="url(#logo-grad-main)" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="320" y1="360" x2="420" y2="360" stroke="#fcd34d" strokeWidth="48" strokeLinecap="round" />
      <path d="M380 90 Q380 140 430 140 Q380 140 380 190 Q380 140 330 140 Q380 140 380 90 Z" fill="#fb923c" />
    </svg>
  );
}

function NavigationBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#050505]/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3 text-sm font-medium tracking-tight text-zinc-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-lg p-1.5">
            <LogoIcon className="h-full w-full" />
          </div>
          <span className="text-base font-semibold tracking-wide text-white">AI Code Review</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium text-zinc-400">
          <a href="https://github.com/Aditya190803/ai-code-review" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-zinc-800 bg-[#111] px-4 py-2 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-white">
            <GithubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Star on GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

function CopyCommand({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="relative group/cmd">
      <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-rose-500/30 via-orange-500/30 to-amber-500/30 opacity-0 blur-lg transition duration-500 group-hover/cmd:opacity-100" />
      <div className="relative flex items-center justify-between rounded-xl border border-zinc-800/80 bg-[#0a0a0a]/90 backdrop-blur-sm px-5 py-3 font-mono text-sm shadow-2xl transition-all sm:text-base">
        <span className="flex items-center whitespace-nowrap pr-8 text-zinc-300">
          <span className="mr-3 select-none text-zinc-600">$</span>
          <span className="mr-2 text-rose-400">curl</span>
          <span className="mr-2 text-zinc-400">-sS</span>
          https://ai-review.adityamer.dev/install.sh
          <span className="mx-2 text-zinc-600">|</span>
          <span className="text-amber-400">bash</span>
        </span>
        <button
          onClick={onCopy}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-zinc-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-white active:scale-95"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function HeroSection({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <section className="mb-20 flex w-full max-w-5xl flex-col items-center text-center sm:mb-28">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-6 text-5xl font-bold tracking-tighter text-white leading-[1.05] sm:text-7xl lg:text-[5.5rem]"
      >
        Code Review at the <br className="hidden sm:block" />
        <span className="bg-gradient-to-r from-rose-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
          Speed of Thought
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-10 max-w-2xl text-lg font-light text-zinc-400 sm:text-xl"
      >
        Catch bugs, optimize performance, and improve security directly in your terminal. Get instant AI insights on your diffs before you commit.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-16 flex w-full justify-center"
      >
        <CopyCommand copied={copied} onCopy={onCopy} />
      </motion.div>

      <div className="w-full flex justify-center">
        <TerminalDemo />
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7 }}
      className="grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-3"
    >
      <div className="group md:col-span-2 rounded-3xl border border-zinc-800/80 bg-gradient-to-br from-[#0a0a0a] to-[#050505] p-8 shadow-xl transition-all hover:border-rose-500/30 hover:shadow-rose-500/5">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
          <BrainCircuit className="h-6 w-6 text-rose-400" />
        </div>
        <h3 className="mb-3 text-2xl font-semibold text-white">Model Agnostic</h3>
        <p className="mb-6 max-w-md text-base leading-relaxed text-zinc-400">
          Bring your own keys. Seamlessly switch between the best frontier models depending on your speed, cost, and token constraints.
        </p>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((provider) => (
            <span key={provider} className="rounded-lg border border-zinc-800 bg-[#111] px-3 py-1.5 text-xs font-medium text-zinc-300">
              {provider}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-bl from-[#0a0a0a] to-[#050505] p-8 shadow-xl transition-all hover:border-orange-500/30 hover:shadow-orange-500/5">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
          <Terminal className="h-6 w-6 text-orange-400" />
        </div>
        <h3 className="mb-3 text-2xl font-semibold text-white">Native TUI</h3>
        <p className="mb-6 text-sm leading-relaxed text-zinc-400">
          Lightning-fast terminal UI. Arrow-key navigation, mouse wheel support, and rich markdown rendering natively built on Ink.
        </p>
        <ul className="space-y-3">
          <li className="flex items-center gap-3 text-sm text-zinc-300"><Check className="h-4 w-4 text-orange-500" /> macOS</li>
          <li className="flex items-center gap-3 text-sm text-zinc-300"><Check className="h-4 w-4 text-orange-500" /> Linux</li>
          <li className="flex items-center gap-3 text-sm text-zinc-300"><Check className="h-4 w-4 text-orange-500" /> Windows (WSL)</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-tr from-[#0a0a0a] to-[#050505] p-8 shadow-xl transition-all hover:border-amber-500/30 hover:shadow-amber-500/5">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
          <Shield className="h-6 w-6 text-amber-400" />
        </div>
        <h3 className="mb-3 text-2xl font-semibold text-white">Smart Scanning</h3>
        <p className="text-sm leading-relaxed text-zinc-400">
          First run builds a local project index, then future scans refresh it incrementally so reviews can reason about related files, imports, and cross-module impact without rescanning everything from scratch.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-tl from-[#0a0a0a] to-[#050505] p-8 shadow-xl transition-all hover:border-rose-500/30 hover:shadow-rose-500/5 md:col-span-2">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10">
          <Code2 className="h-6 w-6 text-rose-400" />
        </div>
        <h3 className="mb-3 text-2xl font-semibold text-white">Universal Language Support</h3>
        <p className="mb-8 max-w-xl text-base leading-relaxed text-zinc-400">
          Review source across modern JavaScript and TypeScript frameworks plus Go, Java, Rust, C, C++, Python, and shell projects. The scanner handles framework-heavy repos and mixed-language codebases from the same workflow.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-2xl border border-zinc-800/50 bg-[#111] p-5">
            <span className="mb-2 block text-sm font-semibold text-zinc-200">Diff Mode</span>
            <span className="text-sm text-zinc-400 text-balance">Changed-file review works across JS, TS, TSX, Go, Java, Rust, C, C++, Python, and shell files in one pass.</span>
          </div>
          <div className="flex-1 rounded-2xl border border-zinc-800/50 bg-[#111] p-5">
            <span className="mb-2 block text-sm font-semibold text-zinc-200">Deep Scan</span>
            <span className="text-sm text-zinc-400">Framework-aware scanning for JS and TS ecosystems, with generic AI review and caching for broader multi-language repositories.</span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function CallToAction() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7 }}
      className="relative mt-16 w-full py-20 text-center sm:py-32"
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-rose-500/5 blur-[100px]" />
      <h2 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-5xl">
        Start reviewing code smarter.
      </h2>
      <p className="mx-auto mb-10 max-w-xl text-base text-zinc-400 sm:text-lg">
        Experience near-instant feedback locally. Drop heavy platforms, keep your codebase spotless.
      </p>
      <a
        href="https://github.com/Aditya190803/ai-code-review"
        target="_blank"
        rel="noreferrer"
        className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 p-[1px] shadow-xl shadow-rose-500/10 transition-transform hover:scale-105 active:scale-95"
      >
        <div className="flex h-full w-full items-center gap-3 rounded-full bg-[#050505] px-8 py-3.5 text-sm font-semibold text-white transition-colors group-hover:bg-transparent group-hover:text-white">
          <GithubIcon className="h-5 w-5" />
          Check the Source Code
        </div>
      </a>
    </motion.section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-zinc-900 bg-[#000]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <LogoIcon className="h-4 w-4 opacity-75 grayscale contrast-200" />
          <span className="font-medium">AI Code Review CLI</span>
        </div>
        <div className="text-sm text-zinc-600">
          MIT Licensed. Built with Bun & React.
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    const COPY_TIMEOUT = 2000;
    navigator.clipboard.writeText("curl -sS https://ai-review.adityamer.dev/install.sh | bash")
      .then(() => {
        if (!mountedRef.current) return;

        setCopied(true);
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setCopied(false);
          }
        }, COPY_TIMEOUT);
      })
      .catch(console.error);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] font-sans text-zinc-300 selection:bg-rose-500/30">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-rose-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-amber-500/15 blur-[120px] rounded-full pointer-events-none" />
      <NavigationBar />

      <main className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-6 pb-24 pt-32 sm:pb-32 sm:pt-40">
        <HeroSection copied={copied} onCopy={handleCopy} />
        <FeatureGrid />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}
