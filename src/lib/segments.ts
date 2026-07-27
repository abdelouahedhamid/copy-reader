import type { TextChunk, WordRange } from "./textChunks";

export interface Segment {
  text: string;
  sentence: boolean;
  word: boolean;
}

export function buildSegments(
  text: string,
  currentChunk: TextChunk | null,
  wordRange: WordRange | null,
): Segment[] {
  if (!currentChunk) return [{ text, sentence: false, word: false }];

  const points = new Set<number>([0, text.length, currentChunk.start, currentChunk.end]);
  if (wordRange) {
    points.add(wordRange.start);
    points.add(wordRange.end);
  }
  const sorted = [...points].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const inSentence = start >= currentChunk.start && end <= currentChunk.end;
    const inWord = !!wordRange && start >= wordRange.start && end <= wordRange.end;
    segments.push({ text: text.slice(start, end), sentence: inSentence, word: inWord });
  }
  return segments;
}
