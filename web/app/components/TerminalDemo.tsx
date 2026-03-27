
"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DashboardScreen = () => (
  <motion.div
    key="dashboard"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="absolute inset-0 flex flex-col w-full h-full p-6 text-zinc-400 font-mono text-[13px] sm:text-[14px]"
  >
    <div className="flex-1 flex flex-col items-center pt-8">
      <pre className="font-bold text-[10px] sm:text-[14px] leading-[1.1] tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-rose-500 via-orange-400 to-amber-400 mb-8 select-none">
{`   █████╗ ██╗ ██████╗██████╗ ███████╗██╗   ██╗██╗███████╗██╗    ██╗
  ██╔══██╗██║ ╚═════╝██╔══██╗██╔════╝██║   ██║██║██╔════╝██║    ██║
  ███████║██║ █████╗ ██████╔╝█████╗  ██║   ██║██║█████╗  ██║ █╗ ██║
  ██╔══██║██║ ╚════╝ ██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██╔══╝  ██║███╗██║
  ██║  ██║██║        ██║  ██║███████╗ ╚████╔╝ ██║███████╗╚███╔███╔╝
  ╚═╝  ╚═╝╚═╝        ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝`}
      </pre>
      
      <div className="grid grid-cols-[1fr_auto_1fr] text-[13px] gap-x-3 gap-y-1 mb-8">
          <div className="text-right text-zinc-500">repo:</div>
          <div className="col-span-2 text-zinc-300 text-left">.ai-code-review</div>

          <div className="text-right text-zinc-500">comparing:</div>
          <div className="col-span-2 text-zinc-300 text-left">main <span className="mx-1">→</span> main (base)</div>

          <div className="text-right text-zinc-500">provider:</div>
          <div className="col-span-2 text-zinc-300 text-left">groq <span className="text-zinc-600 mx-1">·</span> model: moonshotai/kimi-k2...</div>

          <div className="text-right text-zinc-500">review language:</div>
          <div className="col-span-2 text-zinc-300 text-left">English <span className="text-zinc-600 mx-1">·</span> tone: strict</div>
      </div>

      <div className="text-center mb-10 text-[13px]">
          <div className="text-zinc-400 mb-0.5">1 Files changed</div>
          <div className="text-zinc-500 mb-1">1 added | 0 modified</div>
          <div>
            <span className="text-[#a3be8c]">+14 insertions</span>
            <span className="text-zinc-600 mx-2">|</span>
            <span className="text-[#bf616a]">-0 deletions</span>
          </div>
      </div>

      <div className="w-full max-w-sm flex flex-col space-y-1.5 text-zinc-200">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 font-bold">❯</span>
            <span>Review Staged/Unstaged Changes</span>
          </div>
          <div className="flex items-center gap-3 px-4 text-zinc-400">
            <span>Scan Full Codebase for Bugs</span>
          </div>
          <div className="flex items-center gap-3 px-4 text-zinc-400">
            <span>Generate PR Summary</span>
          </div>
          <div className="flex items-center gap-3 px-4 text-zinc-400">
            <span>Settings</span>
          </div>
          <div className="flex items-center gap-3 px-4 text-zinc-400">
            <span>Quit</span>
          </div>
      </div>
    </div>

    <div className="absolute bottom-6 left-6 text-zinc-500 text-[12px]">
      ↑↓ or mouse wheel navigate <span className="mx-3">·</span> Enter/Space select <span className="mx-3">·</span> ? help
    </div>
  </motion.div>
);

const ScanningScreen = () => (
  <motion.div
    key="scanning"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="absolute inset-0 flex flex-col items-center justify-center w-full h-full p-6 text-zinc-400 font-mono text-[13px]"
  >
    <div className="space-y-6 text-center">
      <div className="text-[#5ea1ff] font-medium tracking-wide">Scanning Codebase...</div>
      <div className="text-[#eab308] tracking-wide">Discovering files...</div>
    </div>
    <div className="absolute bottom-6 left-0 right-0 text-center text-zinc-600 text-[13px]">
      Press ESC twice to cancel
    </div>
  </motion.div>
);

const ListScreen = () => (
  <motion.div
    key="list"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="absolute inset-0 flex flex-col w-full h-full p-4 sm:p-5 text-zinc-300 font-mono text-[11px] sm:text-[12px] leading-relaxed"
  >
    <div className="flex justify-between items-center mb-1 text-zinc-400">
      <div>Filter: Press / to filter files</div>
    </div>
    <div className="h-px w-full bg-zinc-700/80 mb-1" />
    <div className="flex justify-between items-center mb-4">
      <div className="flex gap-1.5">
        <span className="text-zinc-400">Files / Issues</span>
        <span className="text-zinc-200">2 Potential Issues</span>
      </div>
      <div className="flex items-center gap-2 text-zinc-400 hidden sm:flex">
        <span>Scanning: [</span>
        <span className="text-amber-600/60 tracking-widest leading-[0.5]">██████████████████████</span><span className="text-zinc-800 tracking-widest leading-[0.5]">██</span>
        <span>] 100% (28/28) ETA: 0s</span>
      </div>
    </div>

    <div className="flex flex-col space-y-4 flex-1">
      <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 font-bold">❯ ▼</span>
            <span className="text-zinc-100">src/api/auth.ts</span>
            <span className="text-zinc-400">(1 Potential Issues)</span>
          </div>
          <div className="flex flex-col gap-2 pl-6">
            <div className="flex flex-col gap-1 border border-[#f43f5e] rounded-sm bg-[#1e1e24] p-3">
              <div className="flex items-start gap-2.5">
                <span className="text-[#f43f5e] font-bold">✖ [🔒] Potential timing attack in token verification</span>
              </div>
              <div className="text-zinc-400 mb-2 pl-[22px]">Line 42-45 • CRITICAL</div>
              <div className="pl-[22px] flex flex-col gap-1">
                <div className="text-[#f43f5e]">━━ PROBLEMATIC CODE ━━</div>
                <div className="text-[#f43f5e]">- if (providedToken === storedToken)</div>
                <div className="text-[#10b981] mt-2">━━ SUGGESTED FIX ━━</div>
                <div className="text-[#10b981]">+ if (crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(storedToken)))</div>
              </div>
               <div className="mt-3 pl-[22px] flex gap-4 text-amber-500 opacity-80 pt-2 border-t border-white/5">
                <span>[c] Copy AI Prompt</span>
                <span>[←/Esc] Back</span>
              </div>
            </div>
          </div>
      </div>
      
       <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 font-bold">  ▼</span>
            <span className="text-zinc-100">components/List.tsx</span>
            <span className="text-zinc-400">(1 Potential Issues)</span>
          </div>
          <div className="flex flex-col gap-2 pl-6">
            <div className="flex flex-col gap-1 border border-[#eab308] rounded-sm bg-[#1e1e24] p-3">
              <div className="flex items-start gap-2.5">
                <span className="text-[#eab308] font-bold">⚠ [⚡] Missing memoization</span>
              </div>
              <div className="text-zinc-400 mb-2 pl-[22px]">Line 18 • WARNING</div>
               <div className="pl-[22px] text-zinc-300">
                Wrap the mapped array in useMemo to prevent re-calculations during unrelated state changes.
              </div>
            </div>
          </div>
      </div>
    </div>

    <div className="mt-auto pt-4">
      <div className="flex gap-4 text-zinc-500 mb-2">
        <div>[s] Sort: <span className="text-[#10b981]">file</span></div>
        <div>[t] Category: <span className="text-[#10b981]">All</span></div>
        <div>[o] Toggle all</div>
      </div>
      
      <div className="flex gap-x-3 gap-y-1 flex-wrap text-zinc-500 text-[10px] sm:text-[11px] font-mono leading-tight">
        <span>↑↓ or mouse wheel navigate</span><span>·</span>
        <span>↔ collapse/open</span><span>·</span>
        <span>PgUp/PgDn jump</span><span>·</span>
        <span>Enter/Space select</span><span>·</span>
        <span>/ filter</span><span>·</span>
        <span>Esc back</span><span>·</span>
        <span>Alt+C copy all</span>
      </div>
    </div>
  </motion.div>
);

export function TerminalDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const runSequence = () => {
      if (step === 0) {
        timeout = setTimeout(() => setStep(1), 4000);
      } else if (step === 1) {
        timeout = setTimeout(() => setStep(2), 2500);
      } else if (step === 2) {
        timeout = setTimeout(() => setStep(0), 8000);
      }
    };
    runSequence();
    return () => clearTimeout(timeout);
  }, [step]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="w-full max-w-4xl mx-auto overflow-hidden border border-zinc-800/80 shadow-2xl relative mt-4 rounded-xl bg-[#2e3440] shadow-black/80"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900/50 bg-[#21222c]">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-xs font-mono text-zinc-500">~/repo/ai-code-review</div>
      </div>
      
      <div className="relative w-full h-[600px] sm:h-[650px] bg-[#282a36] text-left overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 0 && <DashboardScreen key="ds" />}
          {step === 1 && <ScanningScreen key="ss" />}
          {step === 2 && <ListScreen key="ls" />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
