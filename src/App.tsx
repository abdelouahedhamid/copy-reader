import { useEffect, useState } from "react";
import { useKokoroTTS } from "./hooks/useKokoroTTS";
import { TextEditor } from "./components/TextEditor";
import { PlaybackControls } from "./components/PlaybackControls";

function App() {
  const [text, setText] = useState("");
  const {
    voices,
    voiceId,
    setVoiceId,
    rate,
    setRate,
    state,
    modelProgress,
    modelLoading,
    chunkProgress,
    currentChunk,
    wordRange,
    error,
    play,
    pause,
    resume,
    stop,
    isSupported,
  } = useKokoroTTS(text);

  const isPlaying = state !== "idle";
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const canPlay = isSupported && text.trim().length > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT")) {
        return;
      }
      if (!canPlay) return;
      e.preventDefault();
      if (state === "idle") play();
      else if (state === "playing") pause();
      else if (state === "paused") resume();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canPlay, state, play, pause, resume]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Copy Reader</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Paste your copy and listen back to catch mistakes in the flow.
        </p>
      </div>

      {!isSupported && (
        <p className="p-4 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
          Your browser doesn't support Web Workers, needed to run the speech engine.
        </p>
      )}

      {error && (
        <p role="alert" className="p-4 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <TextEditor
          text={text}
          onChange={setText}
          currentChunk={currentChunk}
          wordRange={wordRange}
          isPlaying={isPlaying}
        />
        {!isPlaying && (
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 px-1">
            <span>{wordCount === 0 ? "" : `${wordCount} word${wordCount === 1 ? "" : "s"}`}</span>
            {text.length > 0 && (
              <button
                onClick={() => setText("")}
                className="hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <PlaybackControls
        state={state}
        rate={rate}
        onRateChange={setRate}
        voices={voices}
        voiceId={voiceId}
        onVoiceChange={setVoiceId}
        modelProgress={modelProgress}
        modelLoading={modelLoading}
        chunkProgress={chunkProgress}
        onPlay={play}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        disabled={!canPlay}
      />
    </main>
  );
}

export default App;
