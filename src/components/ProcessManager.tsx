import { useState } from "react";
import { Activity, RefreshCw, Search, XCircle } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { GlowButton } from "./GlowButton";
import { PanelHeader } from "./PanelHeader";
import { useAssistantApi } from "@/hooks/AssistantContext";
import type { ProcessInfo } from "@/types";

const DEMO: ProcessInfo[] = [
  { pid: 4821, name: "chrome.exe", cpu: 12.4, ram: 22.1, status: "running" },
  { pid: 2103, name: "Code.exe", cpu: 8.7, ram: 14.3, status: "running" },
  { pid: 981, name: "explorer.exe", cpu: 2.1, ram: 6.4, status: "running" },
  { pid: 5567, name: "spotify.exe", cpu: 3.5, ram: 5.8, status: "running" },
  { pid: 3320, name: "Discord.exe", cpu: 4.2, ram: 5.1, status: "running" },
  { pid: 1740, name: "node.exe", cpu: 6.9, ram: 4.7, status: "running" },
  { pid: 8890, name: "steam.exe", cpu: 1.2, ram: 3.9, status: "running" },
  { pid: 6612, name: "python.exe", cpu: 5.4, ram: 3.2, status: "running" },
];

export function ProcessManager() {
  const { processInput } = useAssistantApi();
  const [q, setQ] = useState("");
  const [seed, setSeed] = useState(0);

  const list = DEMO.map((p) => ({
    ...p,
    cpu: Math.max(0.1, +(p.cpu + ((seed * 7 + p.pid) % 5) - 2).toFixed(1)),
  }))
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.ram - a.ram);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <PanelHeader icon={Activity} title="प्रोसेस मैनेजर" desc="चल रहे प्रोग्राम देखें और बंद करें" />
        <GlowButton onClick={() => { setSeed((s) => s + 1); processInput("list processes"); }}><RefreshCw size={15} /> रिफ्रेश</GlowButton>
      </div>

      <GlassCard className="flex items-center gap-2 p-3">
        <Search size={16} className="text-white/40" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="प्रोसेस खोजें..." className="flex-1 bg-transparent text-white outline-none placeholder-white/30" />
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="grid grid-cols-[60px_1fr_70px_70px_80px_50px] gap-2 border-b border-white/10 px-4 py-3 text-xs uppercase text-white/40">
          <span>PID</span><span>नाम</span><span>CPU</span><span>RAM</span><span>स्थिति</span><span></span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {list.map((p) => (
            <div key={p.pid} className="grid grid-cols-[60px_1fr_70px_70px_80px_50px] items-center gap-2 border-b border-white/5 px-4 py-3 text-sm last:border-0 hover:bg-white/5">
              <span className="font-mono text-white/50">{p.pid}</span>
              <span className="truncate text-white">{p.name}</span>
              <span className="text-violet-300">{p.cpu}%</span>
              <span className="text-cyan-300">{p.ram}%</span>
              <span className="text-xs text-green-400">{p.status}</span>
              <button onClick={() => processInput(`kill process ${p.name}`)} className="text-red-400/60 hover:text-red-400" title="बंद करें"><XCircle size={17} /></button>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
