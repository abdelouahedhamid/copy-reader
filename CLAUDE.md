# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Copy Reader — webapp reads pasted text aloud so user can catch flow/wording mistakes by ear. Vite + React + TypeScript, Tailwind CSS v4. Pure client-side SPA, no backend, no build-time env vars.

## Commands

- `npm run dev` — start dev server
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run lint` — oxlint
- `npm run preview` — preview production build

No test suite configured.

## Architecture

- `src/hooks/useSpeechSynthesis.ts` — wraps `window.speechSynthesis`. Splits input text into sentence chunks (`splitIntoSentences`) and queues one `SpeechSynthesisUtterance` per sentence rather than one long utterance, working around a Chrome bug where utterances >~15s can silently stop. Also handles async voice loading (`voiceschanged` event — Chrome returns `getVoices() === []` on first call) and tracks the currently-spoken word via `onboundary` (falls back to a regex word-length guess when `charLength` is unsupported, e.g. Safari).
- `src/components/TextEditor.tsx` — textarea for pasting/editing copy. While playing, swaps to a read-only view with the current sentence/word highlighted, built via `buildSegments` (splits text into segments by chunk/word boundaries from the hook).
- `src/components/PlaybackControls.tsx` — play/pause/resume/stop buttons, rate slider (0.5x–2x), voice `<select>` populated from the hook's voice list.
- `src/App.tsx` — holds `text` state, wires the hook to the two components.

## Non-obvious conventions

- Tailwind v4 setup: no `tailwind.config.js`/PostCSS — plugin registered in `vite.config.ts` (`@tailwindcss/vite`), styles pulled in via `@import "tailwindcss";` in `src/index.css`.
- "Pause" during playback stops speech synthesis mid-utterance (browser `pause()`/`resume()` on long utterances is unreliable) but since utterances are chunked per-sentence this is rarely an issue in practice.
