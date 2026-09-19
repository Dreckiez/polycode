import type { ColorScheme } from "../lib/appearance";
import { highlightTexts, type SyntaxToken } from "./syntaxTokens";

export type SyntaxTokensRequest = {
  id: number;
  path: string;
  original: string;
  current: string;
  scheme: ColorScheme;
  presetId: string;
};

export type SyntaxTokensResponse = {
  id: number;
  original?: SyntaxToken[][];
  current?: SyntaxToken[][];
  error?: string;
};

const ctx = self as unknown as {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (e: MessageEvent<SyntaxTokensRequest>) => void,
  ) => void;
};

// Syntax parsing and token painting are pure CPU work (100ms–500ms on big
// diffs). Running it here keeps mouse clicks and scrolling on the main thread.
ctx.addEventListener("message", async (e: MessageEvent<SyntaxTokensRequest>) => {
  const { id, path, original, current, scheme, presetId } = e.data;
  try {
    const result = await highlightTexts(
      path,
      original,
      current,
      scheme,
      presetId,
    );
    ctx.postMessage({
      id,
      original: result.original,
      current: result.current,
    } satisfies SyntaxTokensResponse);
  } catch (err: unknown) {
    ctx.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } as SyntaxTokensResponse);
  }
});