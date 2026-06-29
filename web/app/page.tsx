"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GithubIcon } from "./components/GithubIcon";
import { motion } from "framer-motion";
import {
  Terminal,
  Copy,
  Check,
  Sparkles,
  Code2,
  BrainCircuit,
  Shield,
  Zap,
  Globe,
  GitBranch,
  Settings,
  Layers,
  Bot,
  KeyRound,
  CreditCard,
  FileCode,
  Play,
  Search,
  MessageSquare,
  ArrowRight,
  Download,
  Cpu,
  Monitor,
} from "lucide-react";

const TerminalDemo = dynamic(
  () => import("./components/TerminalDemo").then((mod) => mod.TerminalDemo),
  { ssr: false }
);

/* ── Data ── */

const API_KEY_PROVIDERS = [
  { name: "OpenCode", note: "Default · big-pickle", default: true },
  { name: "Anthropic", note: "claude-sonnet-4-5" },
  { name: "Google Gemini", note: "gemini-2.5-flash" },
  { name: "OpenAI", note: "gpt-5-mini" },
  { name: "OpenRouter", note: "Any model" },
  { name: "Cerebras", note: "llama-4-scout" },
];

const SUBSCRIPTION_PROVIDERS = [
  { name: "OpenAI Codex", note: "ChatGPT plan login" },
  { name: "Claude Code", note: "Agent SDK" },
];

const REVIEW_LANGUAGES = [
  "English", "Hindi", "Spanish", "French", "German",
  "Japanese", "Chinese", "Portuguese", "Korean", "Russian",
];

const PROGRAMMING_LANGUAGES = [
  { name: "JavaScript", ext: ".js .jsx .mjs .cjs" },
  { name: "TypeScript", ext: ".ts .tsx .mts .cts" },
  { name: "Python", ext: ".py" },
  { name: "Go", ext: ".go" },
  { name: "Java", ext: ".java" },
  { name: "Rust", ext: ".rs" },
  { name: "C", ext: ".c .h" },
  { name: "C++", ext: ".cpp .hpp" },
  { name: "Shell", ext: ".sh" },
];

const REVIEW_SCOPES = [
  { label: "Staged", flag: "--staged", desc: "Only staged changes" },
  { label: "Unstaged", flag: "--unstaged", desc: "Only unstaged changes" },
  { label: "Uncommitted", flag: "--uncommitted", desc: "All uncommitted (default)" },
  { label: "Committed", flag: "--committed", desc: "Last committed changes" },
  { label: "Full Repo", flag: "--type all", desc: "Scan entire codebase" },
  { label: "Base Branch", flag: "--base main", desc: "Compare against branch" },
  { label: "Base Commit", flag: "--base-commit <sha>", desc: "Compare against SHA" },
];

const CLI_COMMANDS = [
  { cmd: "ai-review review", desc: "Review uncommitted changes (default)" },
  { cmd: "ai-review review --interactive", desc: "Interactive TUI mode with setup wizard" },
  { cmd: "ai-review review --agent", desc: "Structured JSON events for CI/agent pipelines" },
  { cmd: "ai-review review --type all", desc: "Deep scan the entire codebase" },
  { cmd: "ai-review review --base main", desc: "Compare against a base branch" },
  { cmd: "ai-review review --base-commit <sha>", desc: "Compare against a specific commit" },
  { cmd: "ai-review doctor", desc: "Run diagnostics — check provider, API key, tools" },
  { cmd: "ai-review init", desc: "Create a .ai-review.yaml repo config" },
  { cmd: "ai-review auth status", desc: "Show current provider & API key status" },
];

/* ── Animation Variants ── */

const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: EASE_OUT },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, delay: i * 0.05, ease: EASE_OUT },
  }),
};

/* ── Logo ── */

function LogoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className}>
      <defs>
        <linearGradient id="logo-grad-main" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path
        d="M140 160 L280 256 L140 352"
        fill="none"
        stroke="url(#logo-grad-main)"
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="320" y1="360" x2="420" y2="360" stroke="#a78bfa" strokeWidth="48" strokeLinecap="round" />
      <path
        d="M380 90 Q380 140 430 140 Q380 140 380 190 Q380 140 330 140 Q380 140 380 90 Z"
        fill="#8b5cf6"
      />
    </svg>
  );
}

/* ── Ambient Background ── */

function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.07]"
        style={{
          background: "radial-gradient(circle, #6366f1, transparent 70%)",
          animation: "blob-drift-1 25s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-[30%] right-[-15%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
        style={{
          background: "radial-gradient(circle, #8b5cf6, transparent 70%)",
          animation: "blob-drift-2 30s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-[-10%] left-[30%] w-[450px] h-[450px] rounded-full opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, #a78bfa, transparent 70%)",
          animation: "blob-drift-3 28s ease-in-out infinite",
        }}
      />
    </div>
  );
}

/* ── Section Heading ── */

function SectionHeading({
  badge,
  badgeIcon: BadgeIcon,
  title,
  highlight,
  subtitle,
}: {
  badge: string;
  badgeIcon?: React.ElementType;
  title: string;
  highlight: string;
  subtitle: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="mb-16 text-center"
    >
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-zinc-400">
        {BadgeIcon && <BadgeIcon className="h-3.5 w-3.5 text-indigo-400" />}
        {badge}
      </div>
      <h2 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
        {title}{" "}
        <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
          {highlight}
        </span>
      </h2>
      <p className="mx-auto max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
        {subtitle}
      </p>
    </motion.div>
  );
}

/* ── Navigation ── */

function NavigationBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-1.5">
            <LogoIcon className="h-full w-full" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            AI Code Review
          </span>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <a href="#features" className="hidden md:inline-block rounded-lg px-3 py-2 text-zinc-400 transition-colors hover:text-white hover:bg-white/[0.04]">
            Features
          </a>
          <a href="#how-it-works" className="hidden md:inline-block rounded-lg px-3 py-2 text-zinc-400 transition-colors hover:text-white hover:bg-white/[0.04]">
            How It Works
          </a>
          <a href="#commands" className="hidden md:inline-block rounded-lg px-3 py-2 text-zinc-400 transition-colors hover:text-white hover:bg-white/[0.04]">
            Commands
          </a>
          <a
            href="https://github.com/Aditya190803/ai-code-review"
            target="_blank"
            rel="noreferrer"
            className="ml-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-white"
          >
            <GithubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ── Copy Command ── */

function CopyCommand({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="group relative w-full max-w-2xl">
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)" }}
      />
      <div className="relative flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0c0c0e] px-5 py-3.5 font-[family-name:var(--font-jetbrains)] text-sm shadow-2xl shadow-black/40 transition-all">
        <span className="flex items-center gap-0 overflow-x-auto whitespace-nowrap pr-4 text-zinc-300">
          <span className="mr-3 select-none text-zinc-600">$</span>
          <span className="text-indigo-400">curl</span>
          <span className="mx-1.5 text-zinc-500">-sS</span>
          <span className="text-zinc-300">https://ai-review.adityamer.dev/install.sh</span>
          <span className="mx-2 text-zinc-600">|</span>
          <span className="text-violet-400">bash</span>
        </span>
        <button
          onClick={onCopy}
          className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white active:scale-95 cursor-pointer"
          aria-label="Copy install command to clipboard"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Stats Bar ── */

function StatsBar() {
  const stats = [
    { icon: Cpu, label: "AI Providers", value: "8" },
    { icon: Code2, label: "Languages", value: "9" },
    { icon: Globe, label: "Review Languages", value: "10" },
    { icon: Monitor, label: "Platforms", value: "3" },
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-wrap items-center justify-center gap-6 sm:gap-10"
    >
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            variants={fadeUp}
            custom={i}
            className="flex items-center gap-2.5 text-sm"
          >
            <Icon className="h-4 w-4 text-indigo-400/60" />
            <span className="font-semibold text-white tabular-nums">{stat.value}</span>
            <span className="text-zinc-500">{stat.label}</span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ── Hero ── */

function HeroSection({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <section className="relative flex w-full max-w-5xl flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-4 py-1.5 text-xs font-medium text-indigo-300"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Terminal-native AI code reviewer
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mb-6 text-4xl font-bold tracking-tight text-white leading-[1.08] sm:text-6xl lg:text-7xl"
      >
        Code Review at the
        <br />
        <span
          className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent"
          style={{ backgroundSize: "200% 100%", animation: "gradient-shift 6s ease-in-out infinite" }}
        >
          Speed of Thought
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mb-10 max-w-2xl text-base font-light leading-relaxed text-zinc-400 sm:text-lg"
      >
        Catch bugs, optimize performance, and improve security directly in your
        terminal. AI-powered reviews of your diffs, full scans, and PR summaries
        — all before you commit.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="mb-10 flex w-full justify-center px-4"
      >
        <CopyCommand copied={copied} onCopy={onCopy} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mb-20"
      >
        <StatsBar />
      </motion.div>

      {/* Terminal Demo */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full"
      >
        {/* Glow behind terminal */}
        <div className="absolute inset-0 -z-10 mx-auto w-[80%] h-[60%] top-[20%] rounded-full bg-indigo-500/[0.04] blur-[80px]" />
        <TerminalDemo />
      </motion.div>
    </section>
  );
}

/* ── Feature Card ── */

function FeatureCard({
  icon: Icon,
  iconColor,
  title,
  description,
  children,
  className = "",
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.03] ${className}`}
    >
      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${iconColor.replace("text-", "bg-").replace("400", "500/10")}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <h3 className="mb-2.5 text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
      {children}
    </motion.div>
  );
}

/* ── Feature Grid ── */

function FeatureGrid() {
  return (
    <section id="features" className="w-full max-w-5xl scroll-mt-24">
      <SectionHeading
        badge="Core Capabilities"
        badgeIcon={Zap}
        title="Built for"
        highlight="developers"
        subtitle="Powerful features that integrate seamlessly into your existing workflow. No new tools to learn."
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-1 gap-4 md:grid-cols-6"
      >
        {/* Row 1: 4 + 2 */}
        <FeatureCard
          icon={BrainCircuit}
          iconColor="text-indigo-400"
          title="Model Agnostic"
          description="Bring your own keys or use existing subscriptions. Seamlessly switch between frontier models."
          className="md:col-span-4"
        >
          <div className="mt-5 space-y-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <KeyRound className="h-3 w-3 text-zinc-600" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">API Key Providers</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {API_KEY_PROVIDERS.map((p) => (
                  <span
                    key={p.name}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      p.default
                        ? "border-indigo-500/20 bg-indigo-500/8 text-indigo-300"
                        : "border-white/[0.06] bg-white/[0.02] text-zinc-400"
                    }`}
                  >
                    {p.name}
                    <span className="ml-1 text-zinc-600">{p.note}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2">
                <CreditCard className="h-3 w-3 text-zinc-600" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Subscription / Account</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUBSCRIPTION_PROVIDERS.map((p) => (
                  <span
                    key={p.name}
                    className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-xs font-medium text-zinc-400"
                  >
                    {p.name}
                    <span className="ml-1 text-zinc-600">{p.note}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FeatureCard>

        <FeatureCard
          icon={Terminal}
          iconColor="text-violet-400"
          title="Native TUI"
          description="Lightning-fast terminal UI with arrow-key navigation, mouse wheel support, and rich markdown rendering."
          className="md:col-span-2"
        >
          <ul className="mt-4 space-y-2">
            {["macOS", "Linux", "Windows (WSL)"].map((os) => (
              <li key={os} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <Check className="h-3.5 w-3.5 text-violet-400" />
                {os}
              </li>
            ))}
          </ul>
        </FeatureCard>

        {/* Row 2: 2 + 4 */}
        <FeatureCard
          icon={Shield}
          iconColor="text-emerald-400"
          title="Smart Scanning"
          description="Builds a local project index on first run, then refreshes incrementally. Unchanged files are never rescanned."
          className="md:col-span-2"
        />

        <FeatureCard
          icon={Layers}
          iconColor="text-amber-400"
          title="Multiple Output Modes"
          description="Run reviews in the mode that fits your workflow."
          className="md:col-span-2"
        >
          <ul className="mt-4 space-y-2">
            {[
              { icon: Terminal, label: "Plain terminal", note: "default" },
              { icon: Sparkles, label: "--interactive" },
              { icon: Bot, label: "--agent" },
              { icon: FileCode, label: "--json" },
            ].map((mode) => {
              const ModeIcon = mode.icon;
              return (
                <li key={mode.label} className="flex items-center gap-2.5 text-sm text-zinc-300">
                  <ModeIcon className="h-3.5 w-3.5 text-amber-400/70" />
                  <span className="font-[family-name:var(--font-jetbrains)] text-xs">{mode.label}</span>
                  {mode.note && <span className="text-zinc-600 text-xs">({mode.note})</span>}
                </li>
              );
            })}
          </ul>
        </FeatureCard>

        <FeatureCard
          icon={Code2}
          iconColor="text-rose-400"
          title="Universal Languages"
          description="Scan source files across modern frameworks and system-level languages — all from the same workflow."
          className="md:col-span-2"
        >
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PROGRAMMING_LANGUAGES.map((lang) => (
              <span
                key={lang.name}
                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-xs font-medium text-zinc-300"
              >
                {lang.name}
                <span className="ml-1 font-[family-name:var(--font-jetbrains)] text-[10px] text-zinc-600">{lang.ext}</span>
              </span>
            ))}
          </div>
        </FeatureCard>
      </motion.div>
    </section>
  );
}

/* ── How It Works ── */

function HowItWorks() {
  const steps = [
    {
      icon: Download,
      title: "Install",
      desc: "One command. Curl the install script and you're ready to go. Requires Bun.",
      code: "curl -sS https://ai-review.adityamer.dev/install.sh | bash",
    },
    {
      icon: Settings,
      title: "Configure",
      desc: "Run the interactive setup wizard to pick your provider, model, review language, and tone.",
      code: "ai-review review --interactive",
    },
    {
      icon: Search,
      title: "Review",
      desc: "Get instant AI feedback on staged changes, full scans, or PR-ready diffs.",
      code: "ai-review review --type staged",
    },
  ];

  return (
    <section id="how-it-works" className="w-full max-w-5xl scroll-mt-24">
      <SectionHeading
        badge="Getting Started"
        badgeIcon={Play}
        title="Up and running in"
        highlight="three steps"
        subtitle="No heavy platforms. No browser tabs. Just your terminal."
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="relative grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        {/* Connecting line (desktop only) */}
        <div className="absolute top-16 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] hidden md:block">
          <div className="h-[1px] w-full bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-purple-500/30" />
        </div>

        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.title}
              variants={fadeUp}
              custom={i}
              className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.03]"
            >
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
                  <Icon className="h-5 w-5 text-indigo-400" />
                </div>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-zinc-400">
                  {i + 1}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mb-5 text-sm leading-relaxed text-zinc-400">{step.desc}</p>
              <div className="rounded-lg border border-white/[0.06] bg-[#0c0c0e] px-4 py-2.5 font-[family-name:var(--font-jetbrains)] text-xs text-zinc-400 overflow-x-auto">
                <span className="mr-2 select-none text-zinc-600">$</span>
                {step.code}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

/* ── Review Scopes ── */

function ReviewScopes() {
  return (
    <section className="w-full max-w-5xl">
      <SectionHeading
        badge="Flexibility"
        badgeIcon={GitBranch}
        title="Flexible"
        highlight="review scopes"
        subtitle="Review exactly what you need — from a single staged hunk to your entire repository."
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {REVIEW_SCOPES.map((scope, i) => (
          <motion.div
            key={scope.label}
            variants={scaleIn}
            custom={i}
            className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-indigo-500/20 hover:bg-white/[0.03]"
          >
            <div className="mb-2 flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-indigo-400/70" />
              <span className="text-sm font-semibold text-white">{scope.label}</span>
            </div>
            <div className="mb-2 font-[family-name:var(--font-jetbrains)] text-xs text-zinc-600">
              {scope.flag}
            </div>
            <div className="text-xs leading-relaxed text-zinc-500">{scope.desc}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* ── Review Languages ── */

function ReviewLanguages() {
  return (
    <section className="w-full max-w-5xl">
      <SectionHeading
        badge="Localization"
        badgeIcon={Globe}
        title="Reviews in"
        highlight="your language"
        subtitle="Get review feedback in 10 natural languages. Set once, applied to every review."
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="flex flex-wrap justify-center gap-2.5"
      >
        {REVIEW_LANGUAGES.map((lang, i) => (
          <motion.div
            key={lang}
            variants={scaleIn}
            custom={i}
            className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 transition-all duration-300 hover:border-indigo-500/20 hover:bg-white/[0.03]"
          >
            <Globe className="h-3.5 w-3.5 text-indigo-400/60" />
            <span className="text-sm font-medium text-zinc-300">{lang}</span>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <span>
            Review tone: <span className="text-zinc-300">Balanced</span> or{" "}
            <span className="text-zinc-300">Strict</span>
          </span>
        </div>
        <span className="text-zinc-700">·</span>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>UI language preference separate from review language</span>
        </div>
      </motion.div>
    </section>
  );
}

/* ── CLI Commands ── */

function CliCommands() {
  return (
    <section id="commands" className="w-full max-w-5xl scroll-mt-24">
      <SectionHeading
        badge="Reference"
        badgeIcon={Terminal}
        title="CLI"
        highlight="commands"
        subtitle="Everything runs from a single binary. ai-review"
      />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]"
      >
        {CLI_COMMANDS.map((item, i) => (
          <div
            key={item.cmd}
            className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-6 py-4 transition-colors hover:bg-white/[0.02] ${
              i !== CLI_COMMANDS.length - 1 ? "border-b border-white/[0.04]" : ""
            }`}
          >
            <code className="shrink-0 font-[family-name:var(--font-jetbrains)] text-sm text-indigo-300 sm:min-w-[380px]">
              <span className="mr-2 select-none text-zinc-600">$</span>
              {item.cmd}
            </code>
            <span className="text-sm text-zinc-500">{item.desc}</span>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

/* ── CTA ── */

function CallToAction() {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="relative w-full py-20 text-center sm:py-28"
    >
      <div className="pointer-events-none absolute inset-0 mx-auto w-[50%] rounded-full bg-indigo-500/[0.04] blur-[100px]" />
      <h2 className="relative mb-6 text-3xl font-bold tracking-tight text-white sm:text-5xl">
        Start reviewing code smarter.
      </h2>
      <p className="relative mx-auto mb-10 max-w-xl text-base text-zinc-400 sm:text-lg">
        Near-instant feedback, locally. Drop heavy platforms, keep your codebase spotless.
      </p>
      <a
        href="https://github.com/Aditya190803/ai-code-review"
        target="_blank"
        rel="noreferrer"
        className="group relative inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
      >
        <GithubIcon className="h-5 w-5" />
        Check the Source Code
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </motion.section>
  );
}

/* ── Footer ── */

function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/[0.04]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="flex items-center gap-2.5 text-sm text-zinc-500">
          <LogoIcon className="h-4 w-4 opacity-60" />
          <span className="font-medium">AI Code Review CLI</span>
        </div>
        <div className="text-sm text-zinc-600">
          MIT Licensed. Built with Bun & React.
        </div>
      </div>
    </footer>
  );
}

/* ── Page ── */

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
    navigator.clipboard
      .writeText("curl -sS https://ai-review.adityamer.dev/install.sh | bash")
      .then(() => {
        if (!mountedRef.current) return;
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setCopied(false);
        }, COPY_TIMEOUT);
      })
      .catch(console.error);
  };

  return (
    <div className="relative min-h-screen bg-[#09090b] font-[family-name:var(--font-inter)] text-zinc-300">
      <AmbientBackground />
      <NavigationBar />

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-32 px-6 pb-16 pt-32 sm:gap-40 sm:pb-24 sm:pt-40">
        <HeroSection copied={copied} onCopy={handleCopy} />
        <FeatureGrid />
        <HowItWorks />
        <ReviewScopes />
        <ReviewLanguages />
        <CliCommands />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}
