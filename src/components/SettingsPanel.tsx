import { useState } from "react";
import { Settings, Eye, EyeOff, Check, X, Zap, Volume2, Palette, Plug, Info, Activity, RefreshCw, Gauge, Smartphone, Copy, Terminal } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { GlowButton } from "./GlowButton";
import { PanelHeader } from "./PanelHeader";
import { Toggle } from "./Toggle";
import { AccentPicker } from "./AccentPicker";
import { useStore } from "@/store/assistantStore";
import { useAssistantApi } from "@/hooks/AssistantContext";
import { PROVIDERS } from "@/lib/constants";
import { sounds } from "@/lib/soundEffects";
import { testProvider } from "@/lib/apiHealth";
import { useLocalIP } from "@/hooks/useLocalIP";
import type { ApiHealthStatus } from "@/types";

const HEALTH_DOT: Record<ApiHealthStatus, string> = {
  unknown: "#6b7280",
  checking: "#eab308",
  ok: "#22c55e",
  error: "#ef4444",
};

function Section({ icon: Icon, title, children }: { icon: typeof Zap; title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center gap-2 text-white/80">
        <Icon size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </GlassCard>
  );
}

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const apiHealth = useStore((s) => s.apiHealth);
  const commandsExecuted = useStore((s) => s.commandsExecuted);
  const { connect } = useAssistantApi();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const configuredCount = Object.values(settings.apiKeys).filter(Boolean).length;

  const runTest = async (provider: string) => {
    setTesting((t) => ({ ...t, [provider]: true }));
    sounds.click();
    await testProvider(provider);
    setTesting((t) => ({ ...t, [provider]: false }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PanelHeader icon={Settings} title="सेटिंग्स" desc="पिका को अपने हिसाब से कस्टमाइज़ करें" />

      {/* AI Provider */}
      <Section icon={Zap} title="AI प्रोवाइडर">
        <div className="mb-4 flex items-center gap-3">
          <select
            value={settings.aiProvider}
            onChange={(e) => updateSettings({ aiProvider: e.target.value })}
            className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-white outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} className="bg-navy-800">
                {p.name} — {p.desc}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <Gauge size={14} className="text-white/40" />
            <span className="text-xs text-white/50">मॉडल</span>
            <input
              value={settings.providerModels[settings.aiProvider] || ""}
              onChange={(e) =>
                updateSettings({
                  providerModels: { ...settings.providerModels, [settings.aiProvider]: e.target.value },
                })
              }
              className="w-40 bg-transparent text-xs text-white outline-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          {PROVIDERS.map((p) => {
            const key = settings.apiKeys[p.id] ?? "";
            const has = Boolean(key);
            const health = apiHealth[p.id];
            const isTesting = testing[p.id];
            return (
              <div key={p.id} className="rounded-xl bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: HEALTH_DOT[health?.status ?? "unknown"],
                      boxShadow: `0 0 6px ${HEALTH_DOT[health?.status ?? "unknown"]}`,
                    }}
                  />
                  <span className="text-sm font-medium text-white">{p.name}</span>
                  <span className="text-[10px] text-white/30">{p.model}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {health?.latencyMs && <span className="text-[10px] text-white/40">{health.latencyMs}ms</span>}
                    <button
                      onClick={() => runTest(p.id)}
                      disabled={isTesting || !has}
                      className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      <RefreshCw size={10} className={isTesting ? "animate-spin" : ""} />
                      {isTesting ? "चेकिंग..." : "टेस्ट"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKeys[p.id] ? "text" : "password"}
                      value={key}
                      onChange={(e) =>
                        updateSettings({ apiKeys: { ...settings.apiKeys, [p.id]: e.target.value } })
                      }
                      placeholder={p.keyEnv}
                      className="w-full rounded-lg bg-white/5 px-3 py-2 pr-9 text-sm text-white outline-none placeholder-white/25"
                    />
                    <button
                      onClick={() => setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      {showKeys[p.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {has ? (
                    <Check size={16} className="text-green-400" />
                  ) : (
                    <X size={16} className="text-white/20" />
                  )}
                </div>
                {health?.status === "error" && health.error && (
                  <p className="mt-1 text-[10px] text-red-300/70">{health.error}</p>
                )}
              </div>
            );
          })}
        </div>
        {configuredCount === 0 && (
          <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200/80">
            💡 कोई API key सेट नहीं है। मुफ्त key के लिए console.groq.com या aistudio.google.com पर जाएँ। तब तक पिका डेमो मोड में चलेगा।
          </p>
        )}
      </Section>

      {/* Custom Providers */}
      <CustomProvidersSection />

      {/* Voice */}
      <Section icon={Volume2} title="आवाज़ सेटिंग्स">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">भाषा</span>
            <select
              value={settings.voiceSettings.language}
              onChange={(e) =>
                updateSettings({ voiceSettings: { ...settings.voiceSettings, language: e.target.value } })
              }
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white outline-none"
            >
              <option value="hi-IN" className="bg-navy-800">हिंदी (Swara)</option>
              <option value="en-US" className="bg-navy-800">English (Jenny)</option>
            </select>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm text-white/70">
              <span>गति</span>
              <span>{settings.voiceSettings.speed}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.voiceSettings.speed}
              onChange={(e) =>
                updateSettings({ voiceSettings: { ...settings.voiceSettings, speed: +e.target.value } })
              }
              className="w-full"
              style={{ accentColor: "var(--accent)" }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">वेक वर्ड ("Hey Pika")</span>
            <Toggle
              on={settings.wakeWordEnabled}
              onClick={() => updateSettings({ wakeWordEnabled: !settings.wakeWordEnabled })}
            />
          </div>
          <GlowButton
            onClick={() => {
              const u = new SpeechSynthesisUtterance("नमस्ते, मैं पिका हूँ");
              u.lang = settings.voiceSettings.language;
              u.rate = settings.voiceSettings.speed;
              speechSynthesis.speak(u);
            }}
          >
            🔊 आवाज़ टेस्ट करें
          </GlowButton>
        </div>
      </Section>

      {/* Appearance */}
      <Section icon={Palette} title="दिखावट">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-white/70">थीम एक्सेंट कलर</span>
          <AccentPicker />
        </div>
        <div className="space-y-3">
          {[
            { k: "soundEffects" as const, label: "साउंड इफेक्ट" },
            { k: "particles" as const, label: "पार्टिकल बैकग्राउंड" },
            { k: "pipMode" as const, label: "Picture-in-Picture मोड" },
          ].map((o) => (
            <div key={o.k} className="flex items-center justify-between">
              <span className="text-sm text-white/70">{o.label}</span>
              <Toggle
                on={settings[o.k]}
                onClick={() => {
                  const val = !settings[o.k];
                  updateSettings({ [o.k]: val });
                  if (o.k === "soundEffects") sounds.enabled = val;
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Connection */}
      <Section icon={Plug} title="कनेक्शन">
        <label className="mb-2 block text-xs text-white/50">ब्रिज URL</label>
        <div className="flex gap-2">
          <input
            value={settings.bridgeUrl}
            onChange={(e) => updateSettings({ bridgeUrl: e.target.value })}
            className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 font-mono text-sm text-white outline-none"
          />
          <GlowButton onClick={connect}>कनेक्ट करें</GlowButton>
        </div>
      </Section>

      {/* Stats */}
      <Section icon={Activity} title="आँकड़े">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-2xl font-semibold" style={{ color: "var(--accent)" }}>
              {commandsExecuted}
            </div>
            <div className="text-xs text-white/50">कुल कमांड</div>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-2xl font-semibold text-cyan-300">{configuredCount}/7</div>
            <div className="text-xs text-white/50">प्रोवाइडर सेट</div>
          </div>
        </div>
      </Section>

      {/* Mobile Access */}
      <MobileAccessSection />

      {/* API Usage Dashboard */}
      <ApiUsageDashboard />

      {/* Setup troubleshooting */}
      <SetupSection />

      {/* About */}
      <Section icon={Info} title="जानकारी">
        <div className="space-y-1 text-sm text-white/60">
          <p className="font-semibold text-white">⚡ पिका AI असिस्टेंट v1.0.0</p>
          <p>पूरी तरह लोकल, पूरी तरह निजी।</p>
          <p className="text-xs text-white/40">MIT License · React + Vite + Python</p>
        </div>
      </Section>
    </div>
  );
}

function CustomProvidersSection() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const list = settings.customProviders;

  const add = () => {
    updateSettings({
      customProviders: [
        ...list,
        { id: crypto.randomUUID(), name: "My Provider", baseUrl: "https://api.example.com/v1/chat/completions", model: "model-name", apiKey: "" },
      ],
    });
  };
  const patch = (id: string, p: Partial<(typeof list)[0]>) =>
    updateSettings({ customProviders: list.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const remove = (id: string) =>
    updateSettings({ customProviders: list.filter((c) => c.id !== id) });

  return (
    <Section icon={Zap} title="कस्टम AI प्रोवाइडर">
      <p className="mb-3 text-xs text-white/50">
        कोई भी OpenAI-compatible endpoint जोड़ें — नाम, Base URL, मॉडल और API key सब customizable।
      </p>
      <div className="space-y-3">
        {list.map((c) => (
          <div key={c.id} className="space-y-2 rounded-xl bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <input
                value={c.name}
                onChange={(e) => patch(c.id, { name: e.target.value })}
                placeholder="Provider Name"
                className="flex-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-semibold text-white outline-none"
              />
              <button onClick={() => remove(c.id)} className="text-red-400/70 hover:text-red-400"><X size={16} /></button>
            </div>
            <input
              value={c.baseUrl}
              onChange={(e) => patch(c.id, { baseUrl: e.target.value })}
              placeholder="Base URL (…/chat/completions)"
              className="w-full rounded-lg bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none placeholder-white/25"
            />
            <div className="flex gap-2">
              <input
                value={c.model}
                onChange={(e) => patch(c.id, { model: e.target.value })}
                placeholder="model-name"
                className="flex-1 rounded-lg bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none placeholder-white/25"
              />
              <input
                type="password"
                value={c.apiKey}
                onChange={(e) => patch(c.id, { apiKey: e.target.value })}
                placeholder="API Key"
                className="flex-1 rounded-lg bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none placeholder-white/25"
              />
            </div>
          </div>
        ))}
      </div>
      <GlowButton onClick={add} className="mt-3"><Zap size={14} /> नया प्रोवाइडर जोड़ें</GlowButton>
    </Section>
  );
}

function MobileAccessSection() {
  const ip = useLocalIP();
  const systemStatus = useStore((s) => s.systemStatus);
  const activeIp = systemStatus?.lan_ip || ip;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(`http://${activeIp}:3000`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section icon={Smartphone} title="मोबाइल एक्सेस">
      <p className="mb-3 text-xs text-white/60">
        Same WiFi पर phone से access करने के लिए:
      </p>
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] p-3">
        <code className="flex-1 font-mono text-sm text-cyan-300">http://{activeIp}:3000</code>
        <button
          onClick={copy}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
        </button>
      </div>
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-white/[0.03] p-4 border border-white/5">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`http://${activeIp}:3000`)}`}
          alt="Connection QR Code"
          className="rounded-lg bg-white p-1.5 transition hover:scale-105 duration-200"
          width={150}
          height={150}
        />
        <span className="text-[10px] text-white/40">QR कोड स्कैन करके मोबाइल में खोलें</span>
      </div>
    </Section>
  );
}

function SetupSection() {
  const [open, setOpen] = useState(false);
  return (
    <Section icon={Terminal} title="स्टेप-बाय-स्टेप सेटअप">
      <p className="mb-3 text-xs text-white/50">
        Bridge काम नहीं कर रहा? नीचे दिए steps follow करें:
      </p>
      <ol className="space-y-2 text-sm text-white/75">
        <li><b>1.</b> Python 3.10+ install करें — <a className="text-cyan-400 underline" href="https://python.org" target="_blank">python.org</a> → "Add to PATH" ज़रूर tick करें</li>
        <li><b>2.</b> Node.js 18+ install करें — <a className="text-cyan-400 underline" href="https://nodejs.org" target="_blank">nodejs.org</a></li>
        <li><b>3.</b> Project folder में <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">start.bat</code> double-click करें (Windows) या <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">python start.py</code> run करें</li>
        <li><b>4.</b> "ALL SYSTEMS GO!" message दिखे तो browser auto-open होगा</li>
        <li><b>5.</b> Mobile access के लिए same WiFi पर phone से ऊपर वाला URL खोलें</li>
      </ol>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs text-cyan-400 hover:underline"
      >
        {open ? "▼ छुपाएँ" : "▶ Manual commands दिखाएँ"}
      </button>
      {open && (
        <div className="mt-3 space-y-2 rounded-lg bg-black/40 p-3 font-mono text-[11px] text-cyan-200">
          <p># Terminal में (project folder के अंदर):</p>
          <p>python -m pip install -r requirements.txt</p>
          <p>npm install</p>
          <p>python pc_bridge.py   # एक terminal में</p>
          <p>npm run dev          # दूसरे terminal में</p>
          <p className="text-white/40"># Bridge test: python test_bridge.py</p>
        </div>
      )}
    </Section>
  );
}

function ApiUsageDashboard() {
  const usageLogs = useStore((s) => s.usageLogs);

  const totalTokens = usageLogs.reduce((acc, curr) => acc + curr.totalTokens, 0);
  const totalPrompt = usageLogs.reduce((acc, curr) => acc + curr.promptTokens, 0);
  const totalCompletion = usageLogs.reduce((acc, curr) => acc + curr.completionTokens, 0);

  return (
    <Section icon={Activity} title="AI टोकन उपयोग (API usage)">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-white/5 p-3 text-center border border-white/5">
          <div className="text-xl font-bold font-mono text-cyan-400">{totalTokens}</div>
          <div className="text-[9px] text-white/40 uppercase">Total Tokens</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3 text-center border border-white/5">
          <div className="text-xl font-bold font-mono text-violet-400">{totalPrompt}</div>
          <div className="text-[9px] text-white/40 uppercase">Prompt</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3 text-center border border-white/5">
          <div className="text-xl font-bold font-mono text-fuchsia-400">{totalCompletion}</div>
          <div className="text-[9px] text-white/40 uppercase">Completion</div>
        </div>
      </div>

      {usageLogs.length === 0 ? (
        <p className="text-center py-4 text-xs text-white/30 italic">कोई टोकन इतिहास नहीं है</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 no-scrollbar">
          {usageLogs.slice(0, 10).map((log) => (
            <div key={log.id} className="rounded-xl bg-white/[0.03] p-3 text-xs border border-white/5 hover:bg-white/5 transition duration-150">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-semibold text-cyan-300 uppercase text-[10px] tracking-wider bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/40">
                  {log.provider}
                </span>
                <span className="font-mono text-[9px] text-white/35">
                  {log.totalTokens} tokens
                </span>
              </div>
              <p className="text-white/80 line-clamp-1 italic font-serif mb-1">"{log.query}"</p>
              <div className="flex gap-4 text-[9px] text-white/40">
                <span>Prompt: <b className="font-mono text-white/50">{log.promptTokens}</b></span>
                <span>Completion: <b className="font-mono text-white/50">{log.completionTokens}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
