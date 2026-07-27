import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let ttsPromise: ReturnType<typeof KokoroTTS.from_pretrained> | null = null;

function getTTS() {
  if (!ttsPromise) {
    const progress_callback = (info: { status: string; progress?: number; file?: string }) => {
      if (info.status === "progress" && typeof info.progress === "number") {
        self.postMessage({ status: "progress", file: info.file, progress: info.progress });
      }
    };
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback,
    });
  }
  return ttsPromise;
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type } = event.data;

  if (type === "load") {
    try {
      const tts = await getTTS();
      self.postMessage({ status: "ready", voices: tts.voices });
    } catch (error) {
      self.postMessage({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (type === "generate") {
    const { id, text, voice } = event.data;
    try {
      const tts = await getTTS();
      const audio = await tts.generate(text, { voice });
      const url = URL.createObjectURL(audio.toBlob());
      self.postMessage({ status: "complete", id, url });
    } catch (error) {
      self.postMessage({ status: "error", id, error: error instanceof Error ? error.message : String(error) });
    }
  }
});
