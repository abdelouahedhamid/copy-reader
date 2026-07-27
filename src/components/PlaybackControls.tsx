import type { KokoroVoice, PlaybackState } from "../hooks/useKokoroTTS";

interface PlaybackControlsProps {
  state: PlaybackState;
  rate: number;
  onRateChange: (rate: number) => void;
  voices: KokoroVoice[];
  voiceId: string;
  onVoiceChange: (voiceId: string) => void;
  modelProgress: number | null;
  modelLoading: boolean;
  chunkProgress: { done: number; total: number } | null;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  disabled: boolean;
}

export function PlaybackControls({
  state,
  rate,
  onRateChange,
  voices,
  voiceId,
  onVoiceChange,
  modelProgress,
  modelLoading,
  chunkProgress,
  onPlay,
  onPause,
  onResume,
  onStop,
  disabled,
}: PlaybackControlsProps) {
  const showProgressBar = modelLoading || state === "loading";
  const progressPct =
    modelProgress !== null
      ? modelProgress
      : chunkProgress
        ? Math.round((chunkProgress.done / chunkProgress.total) * 100)
        : 0;
  const progressLabel =
    modelProgress !== null
      ? `Loading voice model… ${modelProgress}%`
      : chunkProgress
        ? `Preparing audio… ${chunkProgress.done}/${chunkProgress.total}`
        : "Loading…";

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-gray-300 dark:border-gray-700">
      <div className="flex gap-2">
        {state === "idle" && !showProgressBar && (
          <button
            onClick={onPlay}
            disabled={disabled}
            className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            Play
          </button>
        )}
        {showProgressBar && (
          <div className="w-48">
            <div className="h-9 rounded-md bg-gray-200 dark:bg-gray-700 overflow-hidden relative flex items-center px-2">
              <div
                className="absolute inset-y-0 left-0 bg-blue-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
              <span className="relative text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                {progressLabel}
              </span>
            </div>
          </div>
        )}
        {state === "playing" && (
          <button onClick={onPause} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Pause
          </button>
        )}
        {state === "paused" && (
          <button onClick={onResume} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Resume
          </button>
        )}
        <button
          onClick={onStop}
          disabled={state === "idle"}
          className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Stop
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        Speed
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={rate}
          onChange={(e) => onRateChange(Number(e.target.value))}
        />
        <span className="w-10 tabular-nums">{rate.toFixed(1)}x</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        Voice
        <select
          value={voiceId}
          onChange={(e) => onVoiceChange(e.target.value)}
          className="bg-transparent border border-gray-300 dark:border-gray-700 rounded px-2 py-1"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.language}, {v.gender})
            </option>
          ))}
        </select>
      </label>

      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
        Press <kbd className="px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600">Space</kbd> to play/pause
      </span>
    </div>
  );
}