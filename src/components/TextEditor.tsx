import type { TextChunk, WordRange } from "../lib/textChunks";
import { buildSegments } from "../lib/segments";

interface TextEditorProps {
  text: string;
  onChange: (text: string) => void;
  currentChunk: TextChunk | null;
  wordRange: WordRange | null;
  isPlaying: boolean;
}

export function TextEditor({ text, onChange, currentChunk, wordRange, isPlaying }: TextEditorProps) {
  if (isPlaying) {
    const segments = buildSegments(text, currentChunk, wordRange);
    return (
      <div
        aria-live="off"
        className="w-full min-h-64 p-4 rounded-lg border border-gray-300 dark:border-gray-700 whitespace-pre-wrap leading-relaxed text-lg"
      >
        {segments.map((seg, i) => (
          <span
            key={i}
            className={
              seg.word
                ? "bg-yellow-300 dark:bg-yellow-500 dark:text-black rounded px-0.5"
                : seg.sentence
                  ? "bg-yellow-100 dark:bg-yellow-900/40 rounded"
                  : undefined
            }
          >
            {seg.text}
          </span>
        ))}
      </div>
    );
  }

  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Paste your copy here…"
      autoFocus
      className="w-full min-h-64 p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent leading-relaxed text-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
