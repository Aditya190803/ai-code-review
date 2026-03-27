
"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

const IssueCardSecurity = ({ lineVariants }: { lineVariants: Variants }) => (
  <motion.div variants={lineVariants} className="border border-red-500 rounded-sm bg-[#000]">
    <div className="p-2 sm:p-3 pb-1 border-b border-zinc-900/50">
      <span className="text-red-500 font-bold">
        ✖ [🔒] Potential timing attack in token verification
      </span>
      <div className="flex justify-between items-center text-zinc-500 mt-1">
        <span>src/api/auth.ts • Line 42-45 • CRITICAL</span>
      </div>
    </div>
    <div className="p-2 sm:p-3">
      <p className="text-white mb-4">Use a constant-time string comparison function to prevent side-channel attacks.</p>
      
      <div className="mt-2 text-[#fff]">
        <span className="text-red-500 font-bold block mb-1">━━ PROBLEMATIC CODE ━━</span>
        <div className="text-red-500">
          - if (providedToken === storedToken)
        </div>
      </div>

      <div className="mt-4 text-[#fff]">
        <span className="text-green-500 font-bold block mb-1">━━ SUGGESTED FIX ━━</span>
        <div className="text-green-500">
          + if (crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(storedToken)))
        </div>
      </div>

      <div className="mt-4 flex gap-4 pt-3 border-t border-zinc-900/50">
          <span className="text-cyan-400">[c] Copy AI Prompt</span>
          <span className="text-cyan-400">[←/Esc] Back</span>
      </div>
    </div>
  </motion.div>
);

const IssueCardOptimization = ({ lineVariants }: { lineVariants: Variants }) => (
  <motion.div variants={lineVariants} className="border border-yellow-500 rounded-sm bg-[#000]">
    <div className="p-2 sm:p-3 pb-1 border-b border-zinc-900/50">
      <span className="text-yellow-500 font-bold">
        ⚠ [⚡] Missing memoization
      </span>
      <div className="flex justify-between items-center text-zinc-500 mt-1">
        <span>components/List.tsx • Line 18 • WARNING</span>
      </div>
    </div>
    <div className="p-2 sm:p-3">
      <p className="text-white mb-2">Wrap the mapped array in useMemo to prevent re-calculations during unrelated state changes.</p>
    </div>
  </motion.div>
);

export function TerminalDemo() {
  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.8, delayChildren: 0.5 }
    }
  };

  const line: Variants = {
    hidden: { opacity: 0, y: 5 },
    show: { opacity: 1, y: 0 }
  };

  const issueCards: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.18,
        delayChildren: 0.1,
      },
    },
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="w-full max-w-3xl mx-auto overflow-hidden border border-zinc-900 bg-[#000] shadow-2xl relative mt-4 rounded-md"
    >
      <div className="flex items-center px-4 py-2 border-b border-zinc-900 bg-[#050505]">
        <div className="flex gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
        </div>
        <div className="mx-auto text-xs font-mono text-zinc-600">~/repo/ai-code-review</div>
      </div>
      
      <div className="p-4 sm:p-6 font-mono text-[13px] sm:text-sm leading-relaxed text-zinc-400 min-h-[380px] text-left">
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          
          <motion.div variants={line} className="flex gap-2 text-zinc-200">
            <span className="text-zinc-600">❯</span>
            <span>ai-review</span>
          </motion.div>
          
          <motion.div variants={line} className="text-zinc-500 flex items-center gap-2">
            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full"></span> 
            <span>Analyzing 3 staged files with GPT-4o...</span>
          </motion.div>

          <motion.div variants={line} className="pt-2">
            <div className="text-zinc-100 flex items-center gap-2">
              <span className="text-green-500">✓</span> Scan complete (1.4s)
            </div>
          </motion.div>

          <motion.div variants={issueCards} className="space-y-4 pt-4">
            <IssueCardSecurity lineVariants={line} />
            <IssueCardOptimization lineVariants={line} />
          </motion.div>

          <motion.div variants={line} className="pt-4 flex gap-2 text-zinc-200">
            <span className="text-zinc-600">❯</span>
            <span className="animate-pulse font-bold">_</span>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
