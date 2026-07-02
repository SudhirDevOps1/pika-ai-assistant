import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/assistantStore";

// ============================================================================
// useVoice — captures the microphone for waveform visualization and uses the
// browser SpeechRecognition API (when available) for quick client-side STT.
// The backend Vosk pipeline is preferred when connected; this is the fallback.
// ============================================================================

export function useVoice(onFinal: (text: string) => void) {
  const setListening = useStore((s) => s.setListening);
  const setWaveform = useStore((s) => s.setWaveform);
  const setPartial = useStore((s) => s.setPartial);
  const isListening = useStore((s) => s.isListening);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);

  const stopWaveform = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setWaveform(new Array(20).fill(0.1));
  }, [setWaveform]);

  const runWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(buf);
      const bars: number[] = [];
      const step = Math.floor(buf.length / 20);
      for (let i = 0; i < 20; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += buf[i * step + j];
        bars.push(Math.min(1, sum / step / 180));
      }
      setWaveform(bars);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, [setWaveform]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;
      setListening(true);
      runWaveform();

      // Browser speech recognition (Chrome / Edge)
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.lang = useStore.getState().settings.voiceSettings.language || "hi-IN";
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = (e: any) => {
          let interim = "";
          let final = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
          }
          setPartial(interim || final);
          if (final) {
            onFinal(final.trim());
            stopListening();
          }
        };
        rec.onerror = () => {};
        rec.onend = () => {};
        recognitionRef.current = rec;
        rec.start();
      }
    } catch {
      useStore.getState().addToast({ type: "error", message: "माइक्रोफोन एक्सेस नहीं मिला" });
      setListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runWaveform, setListening, setPartial, onFinal]);

  const stopListening = useCallback(() => {
    setListening(false);
    setPartial("");
    stopWaveform();
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
  }, [setListening, setPartial, stopWaveform]);

  const toggle = useCallback(() => {
    if (useStore.getState().isListening) stopListening();
    else startListening();
  }, [startListening, stopListening]);

  useEffect(() => () => stopWaveform(), [stopWaveform]);

  return { isListening, startListening, stopListening, toggle };
}
