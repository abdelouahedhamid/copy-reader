export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

export interface WordRange {
  start: number;
  end: number;
}

const QUOTE_CHARS = new Set(['"', "“", "”"]);

/**
 * Splits text into sentence boundaries, then merges consecutive sentences up
 * to maxChunkLength into one chunk. Kokoro generates one audio clip per call
 * with its own prosody — one clip per sentence sounds choppy (pitch/rhythm
 * resets at every boundary), so batching several sentences per clip reads
 * closer to natural continuous speech while keeping per-chunk latency and
 * highlight granularity reasonable.
 *
 * Sentence-ending punctuation inside a quoted span (e.g. `"Wait!" she said.`)
 * is not treated as a boundary — splitting there used to leave a fragment
 * starting with a lone stray quote mark, which broke Kokoro's phonemizer and
 * killed playback outright.
 */
export function splitIntoSentences(text: string, maxChunkLength = 280): TextChunk[] {
  const boundaries: number[] = [];
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (QUOTE_CHARS.has(ch)) {
      inQuote = !inQuote;
      continue;
    }
    if ((ch === "." || ch === "!" || ch === "?") && !inQuote) {
      let j = i + 1;
      while (j < text.length && ".!?".includes(text[j])) j++;
      if (j < text.length && QUOTE_CHARS.has(text[j])) {
        inQuote = false;
        j++;
      }
      while (j < text.length && /\s/.test(text[j])) j++;
      boundaries.push(j);
      i = j - 1;
    }
  }
  if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);

  const sentences: TextChunk[] = [];
  let start = 0;
  for (const end of boundaries) {
    if (end > start && text.slice(start, end).trim().length > 0) {
      sentences.push({ text: text.slice(start, end), start, end });
    }
    start = end;
  }

  const merged: TextChunk[] = [];
  for (const s of sentences) {
    const last = merged[merged.length - 1];
    if (last && last.end - last.start + (s.end - s.start) <= maxChunkLength) {
      last.text = text.slice(last.start, s.end);
      last.end = s.end;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Word offsets within a chunk's own text, used to map audio playback position to a word. */
export function computeWordRanges(text: string): WordRange[] {
  const ranges: WordRange[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}
