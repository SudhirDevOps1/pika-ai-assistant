// ============================================================================
// Pika AI Assistant — Client-side NLU command parser + demo executor
// Parses Hindi / English / Hinglish text into a structured command.
// When the backend bridge is connected the raw command is sent over WS;
// in demo mode a realistic simulated response is generated locally.
// ============================================================================

import { WEBSITE_LIST } from "./constants";
import { safeCalc } from "./utils";

export interface ParsedCommand {
  category: string;
  action: string;
  params: Record<string, unknown>;
  needsConfirmation: boolean;
  confirmMessage?: string;
}

export interface CommandResult {
  parsed: ParsedCommand | null;
  reply: string; // simulated / immediate reply
  toast?: { type: "success" | "error" | "info" | "warning"; message: string };
  openUrl?: string;
  isLLM?: boolean; // true when nothing matched -> should go to LLM
}

const NEED_CONFIRM: Record<string, string[]> = {
  system: ["shutdown", "restart", "sleep", "hibernate"],
  files: ["delete", "delete_folder"],
  processes: ["kill"],
  disk: ["cleanup_temp"],
  macros: ["play"],
  scheduler: ["clear_all"],
};

function needsConfirm(category: string, action: string): boolean {
  return NEED_CONFIRM[category]?.includes(action) ?? false;
}

// Pattern → handler. Each returns partial command + immediate reply.
type Handler = (m: RegExpMatchArray) => CommandResult;

interface Rule {
  re: RegExp;
  handle: Handler;
}

function cmd(
  category: string,
  action: string,
  params: Record<string, unknown>,
  reply: string,
  extra?: Partial<CommandResult>
): CommandResult {
  return {
    parsed: {
      category,
      action,
      params,
      needsConfirmation: needsConfirm(category, action),
      confirmMessage: extra?.toast?.message,
    },
    reply,
    ...extra,
  };
}

const RULES: Rule[] = [
  // ---- System ----
  { re: /(?:computer|system|laptop|पीसी|कंप्यूटर)?\s*(?:shutdown|shut down|switch off|बंद कर)/i, handle: () => cmd("system", "shutdown", { delay: 30 }, "⚠️ कंप्यूटर 30 सेकंड में बंद हो जाएगा। पुष्टि करें।") },
  { re: /(?:restart|reboot|रीस्टार्ट|दोबारा शुरू)/i, handle: () => cmd("system", "restart", { delay: 30 }, "⚠️ कंप्यूटर रीस्टार्ट होगा। पुष्टि करें।") },
  { re: /(?:sleep|स्लीप|सो जा)/i, handle: () => cmd("system", "sleep", {}, "⚠️ कंप्यूटर स्लीप मोड में जाएगा।") },
  { re: /(?:lock|लॉक)/i, handle: () => cmd("system", "lock", {}, "🔒 कंप्यूटर लॉक कर दिया।", { toast: { type: "success", message: "Locked" } }) },
  { re: /(?:log ?off|log ?out|लॉग आउट)/i, handle: () => cmd("system", "logoff", {}, "🚪 लॉग आउट किया जा रहा है।") },
  { re: /(?:hibernate|हाइबरनेट)/i, handle: () => cmd("system", "hibernate", {}, "⚠️ हाइबरनेट किया जाएगा।") },

  // ---- Volume ----
  { re: /(?:volume|आवाज़|sound)\s*(\d{1,3})/i, handle: (m) => cmd("volume", "set", { percent: +m[1] }, `🔊 आवाज़ ${m[1]}% पर सेट कर दी।`, { toast: { type: "success", message: `Volume ${m[1]}%` } }) },
  { re: /(?:volume up|आवाज़ बढ़ाओ|sound up|आवाज बढ़ा)/i, handle: () => cmd("volume", "up", { amount: 10 }, "🔊 आवाज़ बढ़ा दी।", { toast: { type: "success", message: "Volume +10" } }) },
  { re: /(?:volume down|आवाज़ कम|sound down|आवाज कम)/i, handle: () => cmd("volume", "down", { amount: 10 }, "🔉 आवाज़ कम कर दी।", { toast: { type: "success", message: "Volume -10" } }) },
  { re: /(?:^|\s)(?:mute|म्यूट)(?:\s|$)/i, handle: () => cmd("volume", "mute", {}, "🔇 म्यूट कर दिया।", { toast: { type: "success", message: "Muted" } }) },
  { re: /(?:unmute|un ?mute|म्यूट हटाओ)/i, handle: () => cmd("volume", "unmute", {}, "🔊 अनम्यूट कर दिया।") },

  // ---- Media ----
  { re: /(?:next|अगला)\s*(?:song|track|गाना)?/i, handle: () => cmd("media", "next", {}, "⏭️ अगला गाना।", { toast: { type: "info", message: "Next track" } }) },
  { re: /(?:previous|पिछला|pichla)\s*(?:song|track|गाना)?/i, handle: () => cmd("media", "previous", {}, "⏮️ पिछला गाना।") },
  { re: /(?:play|pause|प्ले|पॉज़)\s*(?:music|song|गाना)?/i, handle: () => cmd("media", "play_pause", {}, "⏯️ मीडिया प्ले/पॉज़।", { toast: { type: "info", message: "Play/Pause" } }) },

  // ---- Apps ----
  { re: /(?:close|band karo|बंद करो|quit|exit)\s+(.+)/i, handle: (m) => cmd("apps", "close", { name: m[1].trim() }, `❌ ${m[1].trim()} बंद कर दिया।`, { toast: { type: "success", message: `Closed ${m[1].trim()}` } }) },
  { re: /(?:open|kholo|खोलो|launch|start|चलाओ)\s+(.+)/i, handle: (m) => {
      const target = m[1].trim().toLowerCase();
      const site = WEBSITE_LIST.find((w) => w.name.toLowerCase().includes(target) || target.includes(w.name.toLowerCase().split(" ")[0]));
      if (site) return cmd("web", "open_site", { name: site.name }, `🌐 ${site.name} खोल रहा हूँ।`, { openUrl: site.url, toast: { type: "success", message: `Opening ${site.name}` } });
      return cmd("apps", "open", { name: m[1].trim() }, `🚀 ${m[1].trim()} खोल रहा हूँ।`, { toast: { type: "success", message: `Opening ${m[1].trim()}` } });
    } },

  // ---- Info ----
  { re: /(?:battery|बैटरी)/i, handle: () => cmd("info", "battery", {}, "🔋 बैटरी की जानकारी ला रहा हूँ...") },
  { re: /(?:cpu)/i, handle: () => cmd("info", "cpu", {}, "🖥️ CPU उपयोग की जानकारी...") },
  { re: /(?:ram|memory|मेमोरी)/i, handle: () => cmd("info", "ram", {}, "💾 RAM उपयोग की जानकारी...") },
  { re: /(?:disk|डिस्क)\s*(?:space|जगह|usage)?/i, handle: () => cmd("info", "disk", {}, "💿 डिस्क जानकारी...") },
  { re: /(?:ip ?address|आईपी)/i, handle: () => cmd("network", "ip", {}, "🌐 IP जानकारी ला रहा हूँ...") },
  { re: /(?:time|समय|clock|घड़ी)/i, handle: () => cmd("info", "time", {}, `🕐 अभी समय है ${new Date().toLocaleTimeString("hi-IN")}।`) },
  { re: /(?:date|तारीख|आज)/i, handle: () => cmd("info", "date", {}, `📅 आज है ${new Date().toLocaleDateString("hi-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}।`) },

  // ---- Web ----
  { re: /(?:search|सर्च|google)\s*(?:for|करो)?\s+(.+)/i, handle: (m) => cmd("web", "search", { query: m[1].trim() }, `🔍 "${m[1].trim()}" सर्च कर रहा हूँ।`, { openUrl: `https://www.google.com/search?q=${encodeURIComponent(m[1].trim())}`, toast: { type: "info", message: "Searching..." } }) },
  { re: /(?:weather|मौसम)\s*(?:of|में|in)?\s*(.+)?/i, handle: (m) => cmd("weather", "get", { location: m[1]?.trim() || "Delhi" }, `🌤️ ${m[1]?.trim() || "Delhi"} का मौसम ला रहा हूँ...`) },

  // ---- Screen ----
  { re: /(?:screenshot|स्क्रीनशॉट)/i, handle: () => cmd("screen", "screenshot", {}, "📸 स्क्रीनशॉट ले लिया! screenshots फोल्डर में सेव।", { toast: { type: "success", message: "Screenshot saved" } }) },
  { re: /(?:start|शुरू)\s*(?:recording|रिकॉर्डिंग)/i, handle: () => cmd("screen", "start_recording", {}, "🎬 स्क्रीन रिकॉर्डिंग शुरू।", { toast: { type: "info", message: "Recording..." } }) },
  { re: /(?:stop|रुको|बंद)\s*(?:recording|रिकॉर्डिंग)/i, handle: () => cmd("screen", "stop_recording", {}, "⏹️ रिकॉर्डिंग बंद, सेव कर दी।", { toast: { type: "success", message: "Saved" } }) },
  { re: /(?:brightness|ब्राइटनेस)\s*(\d{1,3})/i, handle: (m) => cmd("screen", "brightness_set", { percent: +m[1] }, `☀️ ब्राइटनेस ${m[1]}% पर।`) },
  { re: /(?:brightness up|ब्राइटनेस बढ़ाओ)/i, handle: () => cmd("screen", "brightness_up", {}, "☀️ ब्राइटनेस बढ़ा दी।") },
  { re: /(?:brightness down|ब्राइटनेस कम)/i, handle: () => cmd("screen", "brightness_down", {}, "🌙 ब्राइटनेस कम कर दी।") },

  // ---- Files ----
  { re: /(?:create|बनाओ)\s+(?:file|फाइल)\s+(.+)/i, handle: (m) => cmd("files", "create_file", { path: m[1].trim() }, `📄 फाइल "${m[1].trim()}" बना दी।`, { toast: { type: "success", message: "File created" } }) },
  { re: /(?:create|बनाओ)\s+(?:folder|directory|फोल्डर)\s+(.+)/i, handle: (m) => cmd("files", "create_folder", { path: m[1].trim() }, `📁 फोल्डर "${m[1].trim()}" बना दिया।`, { toast: { type: "success", message: "Folder created" } }) },
  { re: /(?:delete|मिटाओ|हटाओ)\s+(?:file|फाइल)\s+(.+)/i, handle: (m) => cmd("files", "delete", { path: m[1].trim() }, `⚠️ फाइल "${m[1].trim()}" डिलीट करें? पुष्टि करें।`) },
  { re: /(?:delete|मिटाओ|हटाओ)\s+(?:folder|फोल्डर)\s+(.+)/i, handle: (m) => cmd("files", "delete_folder", { path: m[1].trim() }, `⚠️ फोल्डर "${m[1].trim()}" डिलीट करें? पुष्टि करें।`) },
  { re: /(?:rename|नाम बदलो|rename karo)\s+(.+?)\s+(?:to|ko|को)\s+(.+)/i, handle: (m) => cmd("files", "rename", { path: m[1].trim(), new_path: m[2].trim() }, `✏️ "${m[1].trim()}" → "${m[2].trim()}" रीनेम कर दिया।`, { toast: { type: "success", message: "Renamed" } }) },
  { re: /(?:list|दिखाओ|show)\s+(?:files\s+(?:in\s+)?|फाइलें\s+)?(desktop|documents|downloads|pictures|music|videos|डेस्कटॉप|डाउनलोड्स)/i, handle: (m) => cmd("files", "list", { path: m[1].trim() }, `📂 "${m[1].trim()}" की फाइलें दिखा रहा हूँ...`) },
  { re: /(desktop|documents|downloads|pictures|music|videos|डाउनलोड्स)\s+(?:mein|में)\s+(?:kya hai|क्या है|what)/i, handle: (m) => cmd("files", "list", { path: m[1].trim() }, `📂 "${m[1].trim()}" में देख रहा हूँ...`) },
  { re: /(?:show|list|दिखाओ)\s+(?:my\s+)?(?:drives|drive|ड्राइव)/i, handle: () => cmd("disk", "list_drives", {}, "💾 आपके ड्राइव्स दिखा रहा हूँ...") },

  // ---- Clipboard ----
  { re: /(?:save|सेव)\s*(?:clipboard|क्लिपबोर्ड)/i, handle: () => cmd("clipboard", "save", {}, "💾 क्लिपबोर्ड सेव किया।") },
  { re: /(?:clear|क्लियर)\s*(?:clipboard|क्लिपबोर्ड)/i, handle: () => cmd("clipboard", "clear", {}, "🗑️ क्लिपबोर्ड क्लियर।") },

  // ---- Processes ----
  { re: /(?:list|दिखाओ)\s*(?:processes|प्रोसेसेज़|running programs|चल रहे प्रोग्राम)/i, handle: () => cmd("processes", "list", {}, "📊 चल रहे प्रोसेस दिखा रहा हूँ...") },
  { re: /(?:kill|मारो|खत्म करो)\s*(?:process|प्रोसेस)?\s+(.+)/i, handle: (m) => cmd("processes", "kill", { name_or_pid: m[1].trim() }, `⚠️ प्रोसेस "${m[1].trim()}" बंद करें? पुष्टि करें।`) },

  // ---- Reminders ----
  { re: /(?:remind|याद दिलाओ)\s*(?:me|मुझे)?\s*(.+?)(?:\s+in\s+|\s+में\s+)(\d+)\s*(min|minute|minutes|मिनट|hour|hours|घंटे|घंटा|sec|second|seconds|सेकंड)/i, handle: (m) => {
      const n = +m[2];
      const unit = m[3].toLowerCase();
      const secs = unit.startsWith("h") || unit.includes("घंट") ? n * 3600 : unit.startsWith("s") || unit.includes("सेकंड") ? n : n * 60;
      return cmd("reminders", "create", { text: m[1].trim(), seconds: secs }, `⏰ ${n} ${m[3]} बाद याद दिलाऊंगा: "${m[1].trim()}"`, { toast: { type: "success", message: "Reminder set" } });
    } },
  { re: /(?:set|लगाओ)\s*(?:timer|टाइमर)\s*(?:for|के लिए)?\s*(\d+)\s*(min|minute|minutes|मिनट|hour|घंटा|sec|second|सेकंड)/i, handle: (m) => {
      const n = +m[1];
      const unit = m[2].toLowerCase();
      const secs = unit.startsWith("h") || unit.includes("घंट") ? n * 3600 : unit.startsWith("s") || unit.includes("सेकंड") ? n : n * 60;
      return cmd("reminders", "timer", { seconds: secs }, `⏱️ ${n} ${m[2]} का टाइमर सेट।`, { toast: { type: "success", message: "Timer set" } });
    } },

  // ---- Calculator ----
  { re: /(?:calculate|कैलकुलेट|what is|कितना होगा|kitna hai)\s+(.+)/i, handle: (m) => {
      const r = safeCalc(m[1]);
      return cmd("calculator", "eval", { expression: m[1].trim() }, r.ok ? `🧮 ${m[1].trim()} = **${r.value}**` : `❌ ${r.error}`);
    } },

  // ---- Password ----
  { re: /(?:generate|जनरेट)\s*(?:password|पासवर्ड)\s*(?:of length|लंबाई)?\s*(\d+)?/i, handle: (m) => cmd("password", "generate", { length: m[1] ? +m[1] : 16 }, "🔐 सुरक्षित पासवर्ड जनरेट किया — Tools टैब में देखें।") },

  // ---- Translator ----
  { re: /(?:translate|ट्रांसलेट)\s+(.+?)(?:\s+to\s+|\s*में\s*)(hindi|हिंदी|english|अंग्रेज़ी|french|german|spanish|japanese|chinese)/i, handle: (m) => cmd("translator", "translate", { text: m[1].trim(), target_lang: m[2] }, `🌍 "${m[1].trim()}" का अनुवाद ${m[2]} में — Tools टैब में देखें।`) },

  // ---- QR ----
  { re: /(?:qr ?code|क्यूआर कोड)\s*(?:generate|बनाओ)?\s+(.+)/i, handle: (m) => cmd("qrcode", "generate", { data: m[1].trim() }, `📱 "${m[1].trim()}" के लिए QR कोड बना दिया — Tools टैब में देखें।`) },

  // ---- Network ----
  { re: /(?:speed ?test|स्पीड टेस्ट|download speed)/i, handle: () => cmd("network", "speed_test", {}, "⚡ स्पीड टेस्ट चला रहा हूँ...") },
  { re: /(?:list|दिखाओ)\s*(?:wifi|वाईफाई)/i, handle: () => cmd("network", "list_wifi", {}, "📶 उपलब्ध WiFi नेटवर्क दिखा रहा हूँ...") },

  // ---- OCR ----
  { re: /(?:ocr|ओसीआर|read|पढ़ो)\s*(?:text|टेक्स्ट)?\s*(?:from|से)?\s*(?:screen|स्क्रीन)/i, handle: () => cmd("ocr", "capture_and_read", {}, "👁️ स्क्रीन से टेक्स्ट पढ़ रहा हूँ...") },

  // ---- Disk ----
  { re: /(?:clean ?up|क्लीन अप|clean)\s*(?:temp|टेम्प)/i, handle: () => cmd("disk", "cleanup_temp", {}, "⚠️ टेम्प फाइलें साफ़ करें? पुष्टि करें।") },

  // ---- Provider switch ----
  { re: /(?:switch|बदलो|use)\s*(?:to|को)?\s*(groq|gemini|mistral|cerebras|openrouter|zai|deepseek)/i, handle: (m) => cmd("config", "switch_provider", { provider: m[1].toLowerCase() }, `🔄 AI प्रोवाइडर ${m[1]} पर बदल दिया।`, { toast: { type: "success", message: `Provider: ${m[1]}` } }) },
];

export function parseCommand(text: string): CommandResult {
  const trimmed = text.trim();
  for (const rule of RULES) {
    const m = trimmed.match(rule.re);
    if (m) return rule.handle(m);
  }
  // Nothing matched → conversational → LLM
  return { parsed: null, reply: "", isLLM: true };
}
