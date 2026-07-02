import { useEffect, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store/assistantStore";
import { sounds } from "@/lib/soundEffects";

export function TerminalConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const messages = useStore((s) => s.messages);
  const activityLog = useStore((s) => s.activityLog);
  const isAiThinking = useStore((s) => s.isAiThinking);
  const isSpeaking = useStore((s) => s.isSpeaking);
  const isListening = useStore((s) => s.isListening);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Combine and sort chat logs and command executions chronologically
  const logs = [
    ...messages.map((m) => ({
      timestamp: new Date(m.timestamp).getTime() || Date.now(),
      text: m.content.replace(/\[COMMAND:.*?\]/g, "").trim(),
      role: m.role,
      tag: m.role === "user" ? "INPUT" : "OUTPUT",
      user: m.role === "user" ? "user@desktop" : "pika@assistant",
      symbol: m.role === "user" ? "$" : "#",
    })),
    ...activityLog.map((log) => ({
      timestamp: log.at,
      text: `ACTION EXECUTED: ${log.text}`,
      role: "command",
      tag: "EXEC",
      user: "pika@bridge",
      symbol: "#",
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Scroll to bottom of terminal when logs update
  useEffect(() => {
    if (isOpen) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, isOpen, isAiThinking, isSpeaking, isListening]);

  const toggle = () => {
    sounds.click();
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Floating CLI toggle button, positioned right above the LivePiP toggle */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggle}
        title="सिस्टम टर्मिनल कंसोल"
        className="fixed bottom-16 right-2 z-50 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg sm:h-12 sm:w-12 bg-zinc-900 border border-zinc-700 hover:border-[#00ff66]/50 transition-colors"
        style={{
          boxShadow: "0 0 15px rgba(0,0,0,0.5)",
        }}
      >
        <Terminal size={18} className={isOpen ? "text-[#00ff66]" : "text-white/80"} />
      </motion.button>

      {/* Retro matrix-themed console sheet */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-40 flex h-[280px] flex-col bg-black/95 text-[#00ff66] font-mono border-t border-[#00ff66]/30 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md select-text"
          >
            {/* Console Window Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-[#00ff66]/10 text-xs text-[#00ff66]/70 select-none">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#00ff66] animate-pulse" />
                <span>PIKA_SYSTEM_MONITOR_SHELL v4.0.0</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-[#00ff66]/50 hover:text-[#00ff66] transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Console Log Area */}
            <div className="flex-1 overflow-y-auto p-4 text-[11px] leading-relaxed space-y-1.5 no-scrollbar select-text">
              <div className="text-[#00ff66]/40 mb-2 border-b border-[#00ff66]/10 pb-1 select-none">
                Welcome to Pika Live Console. System online. Listening on port 8765...
              </div>

              {logs.map((log, idx) => {
                const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                
                // Color formatting for tags to improve scans
                let colorClass = "text-[#00ff66]";
                if (log.tag === "INPUT") colorClass = "text-[#00ffff] bg-cyan-500/10 border-cyan-500/20";
                if (log.tag === "EXEC") colorClass = "text-[#ffff00] bg-yellow-500/10 border-yellow-500/20";
                if (log.tag === "OUTPUT") colorClass = "text-[#00ff66] bg-green-500/10 border-green-500/20";

                return (
                  <div key={idx} className="font-mono">
                    <span className="text-[#00ff66]/40 select-none">[{timeStr}]</span>{" "}
                    <span className="text-zinc-500 select-none">{log.user}:{log.symbol}</span>{" "}
                    <span className={`font-semibold text-[9px] px-1 py-0.2 rounded border mr-1.5 select-none ${colorClass}`}>
                      {log.tag}
                    </span>
                    <span className="text-zinc-100 select-text whitespace-pre-wrap">{log.text}</span>
                  </div>
                );
              })}

              {/* Dynamic Action Streams */}
              {isListening && (
                <div className="text-cyan-400 animate-pulse select-none font-mono">
                  <span>[LISTENING] user speaking...</span>
                </div>
              )}
              {isAiThinking && (
                <div className="text-violet-400 animate-pulse select-none font-mono">
                  <span>[THINKING] assistant processing query...</span>
                </div>
              )}

              <div ref={consoleEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
