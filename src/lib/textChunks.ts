export interface TextChunk {
  text: string;
  /**
   * Text actually sent to Kokoro for generation. Same content as `text` but
   * with runs of whitespace (importantly, blank lines between paragraphs)
   * collapsed to a single space. Kokoro's phonemizer/duration predictor
   * treats raw newlines as long pauses, so a chunk spanning a paragraph
   * break would otherwise produce a multi-second silence mid-clip.
   */
  spokenText: string;
  start: number;
  end: number;
}

export interface WordRange {
  start: number;
  end: number;
}

const QUOTE_CHARS = new Set(['"', "“", "”"]);

/** Collapses any run of whitespace (including blank lines) to a single space, trimmed. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

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
      const chunkText = text.slice(start, end);
      sentences.push({ text: chunkText, spokenText: normalizeWhitespace(chunkText), start, end });
    }
    start = end;
  }

  const merged: TextChunk[] = [];
  for (const s of sentences) {
    const last = merged[merged.length - 1];
    if (last && last.end - last.start + (s.end - s.start) <= maxChunkLength) {
      last.text = text.slice(last.start, s.end);
      last.spokenText = normalizeWhitespace(last.text);
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
