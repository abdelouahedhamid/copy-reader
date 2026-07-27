import { useCallback, useEffect, useRef, useState } from "react";
import { computeWordRanges, splitIntoSentences, type TextChunk, type WordRange } from "../lib/textChunks";

export type { TextChunk, WordRange };

export interface KokoroVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
}

/**
 * Kokoro ships ~30 voices but most (grade C/D) sound robotic or garbled.
 * Picker surfaces exactly one female + one male voice. af_heart (grade A) is
 * the best female voice and the default. Kokoro has no A/B-grade male voice —
 * all male voices cap at C+ — so am_michael is the best available male.
 */
const GOOD_VOICE_IDS = ["af_heart", "am_michael"];

export type PlaybackState = "idle" | "loading" | "playing" | "paused";

interface PendingGenerate {
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

export function useKokoroTTS(text: string) {
  const [voices, setVoices] = useState<KokoroVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [rate, setRate] = useState(1);
  const [state, setState] = useState<PlaybackState>("idle");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const chunkProgress = null;
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [chunkIndex, setChunkIndex] = useState(-1);
  const [wordRange, setWordRange] = useState<WordRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const modelReadyRef = useRef<Promise<void> | null>(null);
  const eagerLoadStartedRef = useRef(false);
  const chunksRef = useRef<TextChunk[]>([]);
  const rateRef = useRef(rate);
  const voiceIdRef = useRef(voiceId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const pendingRef = useRef<Map<number, PendingGenerate>>(new Map());
  const inFlightRef = useRef<Map<number, Promise<string>>>(new Map());
  const generationChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const genIdRef = useRef(0);
  const playTokenRef = useRef(0);

  rateRef.current = rate;
  voiceIdRef.current = voiceId;

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/ttsWorker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent) => {
        const data = event.data;
        if (data.status === "progress") {
          setModelProgress(Math.round(data.progress ?? 0));
        } else if (data.status === "complete") {
          const pending = pendingRef.current.get(data.id);
          if (pending) {
            pending.resolve(data.url);
            pendingRef.current.delete(data.id);
          }
        } else if (data.status === "error" && typeof data.id === "number") {
          const pending = pendingRef.current.get(data.id);
          if (pending) {
            pending.reject(new Error(data.error));
            pendingRef.current.delete(data.id);
          }
        }
      });
      workerRef.current = worker;
    }
    return workerRef.current;
  }, []);

  const ensureModelLoaded = useCallback(() => {
    if (!modelReadyRef.current) {
      const worker = getWorker();
      modelReadyRef.current = new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          if (event.data.status === "ready") {
            const list: KokoroVoice[] = Object.entries(
              event.data.voices as Record<string, { name: string; language: string; gender: string }>,
            )
              .filter(([id]) => GOOD_VOICE_IDS.includes(id))
              .sort((a, b) => GOOD_VOICE_IDS.indexOf(a[0]) - GOOD_VOICE_IDS.indexOf(b[0]))
              .map(([id, v]) => ({ id, name: v.name, language: v.language, gender: v.gender }));
            setVoices(list);
            const chosen = voiceIdRef.current || list[0]?.id || "";
            voiceIdRef.current = chosen;
            setVoiceId(chosen);
            worker.removeEventListener("message", handler);
            resolve();
          } else if (event.data.status === "error" && typeof event.data.id !== "number") {
            worker.removeEventListener("message", handler);
            reject(new Error(event.data.error));
          }
        };
        worker.addEventListener("message", handler);
        worker.postMessage({ type: "load" });
      });
    }
    return modelReadyRef.current;
  }, [getWorker]);

  useEffect(() => {
    if (eagerLoadStartedRef.current || text.trim().length === 0) return;
    eagerLoadStartedRef.current = true;
    setModelLoading(true);
    ensureModelLoaded()
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setModelLoading(false);
        setModelProgress(null);
      });
  }, [text, ensureModelLoaded]);

  const enqueueGeneration = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const result = generationChainRef.current.then(fn, fn);
    generationChainRef.current = result.catch(() => {});
    return result;
  }, []);

  const generateChunk = useCallback(
    (index: number, token: number): Promise<string> => {
      const cached = audioCacheRef.current.get(index);
      if (cached) return Promise.resolve(cached);

      const inFlight = inFlightRef.current.get(index);
      if (inFlight) return inFlight;

      const worker = getWorker();
      const chunkText = chunksRef.current[index].text;
      const voice = voiceIdRef.current;

      const promise = enqueueGeneration(
        () =>
          new Promise<string>((resolve, reject) => {
            const id = genIdRef.current++;
            pendingRef.current.set(id, {
              resolve: (url) => {
                if (playTokenRef.current === token) {
                  audioCacheRef.current.set(index, url);
                } else {
                  URL.revokeObjectURL(url);
                }
                resolve(url);
              },
              reject,
            });
            worker.postMessage({ type: "generate", id, text: chunkText, voice });
          }),
      ).finally(() => {
        inFlightRef.current.delete(index);
      });

      inFlightRef.current.set(index, promise);
      return promise;
    },
    [getWorker, enqueueGeneration],
  );

  const playChunk = useCallback(
    async (index: number, token: number) => {
      const currentChunks = chunksRef.current;
      if (index >= currentChunks.length) {
        setState("idle");
        setChunkIndex(-1);
        setWordRange(null);
        return;
      }
      setChunkIndex(index);
      setWordRange(null);

      let url: string;
      try {
        url = await generateChunk(index, token);
      } catch (err) {
        if (playTokenRef.current !== token) return;
        setError(err instanceof Error ? err.message : String(err));
        playChunk(index + 1, token);
        return;
      }
      if (playTokenRef.current !== token) return;

      const chunk = currentChunks[index];
      const wordRanges = computeWordRanges(chunk.text);
      const audio = new Audio(url);
      audio.playbackRate = rateRef.current;
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (!audio.duration || playTokenRef.current !== token) return;
        const fraction = audio.currentTime / audio.duration;
        const charIndex = Math.min(chunk.text.length - 1, Math.floor(fraction * chunk.text.length));
        const range = wordRanges.find((r) => charIndex >= r.start && charIndex < r.end) ?? wordRanges[wordRanges.length - 1];
        if (range) setWordRange({ start: chunk.start + range.start, end: chunk.start + range.end });
      };
      audio.onended = () => {
        if (playTokenRef.current !== token) return;
        playChunk(index + 1, token);
      };
      audio.onerror = () => {
        if (playTokenRef.current !== token) return;
        playChunk(index + 1, token);
      };

      setState("playing");
      audio.play().catch((err) => {
        if (playTokenRef.current !== token) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [generateChunk],
  );

  const backgroundGenerate = useCallback(
    async (chunksToGenerate: TextChunk[], token: number) => {
      for (let i = 1; i < chunksToGenerate.length; i++) {
        if (playTokenRef.current !== token) return;
        try {
          await generateChunk(i, token);
        } catch (err) {
          if (playTokenRef.current !== token) return;
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [generateChunk],
  );

  const play = useCallback(() => {
    setError(null);
    const newChunks = splitIntoSentences(text);
    chunksRef.current = newChunks;
    setChunks(newChunks);
    audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    inFlightRef.current.clear();
    if (newChunks.length === 0) return;

    const token = ++playTokenRef.current;
    setState("loading");

    (async () => {
      try {
        await ensureModelLoaded();
      } catch (err) {
        if (playTokenRef.current !== token) return;
        setError(err instanceof Error ? err.message : String(err));
        setState("idle");
        return;
      }
      if (playTokenRef.current !== token) return;
      setModelProgress(null);

      playChunk(0, token);
      backgroundGenerate(newChunks, token);
    })();
  }, [text, ensureModelLoaded, playChunk, backgroundGenerate]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play();
    setState("playing");
  }, []);

  const stop = useCallback(() => {
    playTokenRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
    setChunkIndex(-1);
    setWordRange(null);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const audioCache = audioCacheRef.current;
    const playToken = playTokenRef;
    return () => {
      playToken.current++;
      audioRef.current?.pause();
      workerRef.current?.terminate();
      audioCache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return {
    voices,
    voiceId,
    setVoiceId,
    rate,
    setRate,
    state,
    modelProgress,
    modelLoading,
    chunkProgress,
    chunks,
    currentChunk: chunkIndex >= 0 ? chunks[chunkIndex] ?? null : null,
    wordRange,
    error,
    play,
    pause,
    resume,
    stop,
    isSupported: typeof window !== "undefined" && "Worker" in window,
  };
}
