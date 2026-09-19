import {
  ensureSyntaxTree,
  syntaxTree,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { highlightCode } from "@lezer/highlight";
import type { ColorScheme } from "../lib/appearance";
import { loadThemePresetId } from "../lib/themePresets";
import type { UnifiedBlock, UnifiedLine } from "../lib/unifiedDiff";
import {
  languageForPath,
  syntaxTagHighlighter,
} from "./editorLanguage";
import type {
  SyntaxTokensRequest,
  SyntaxTokensResponse,
} from "./syntaxTokens.worker";

type DiffFile = {
  path: string;
  binary?: boolean;
  tooLarge?: boolean;
  blocks: readonly UnifiedBlock[];
};

export type SyntaxToken = {
  text: string;
  color?: string;
};

const MAX_DIFF_HIGHLIGHT_CHARS = 250_000;
const SYNTAX_TREE_BUDGET_MS = 100;

export function highlightSource(
  text: string,
  language: Extension | null,
  scheme: ColorScheme,
  presetId?: string,
): SyntaxToken[][] {
  if (!text) return [[]];
  if (!language) return unstyledLines(text);

  const state = EditorState.create({
    doc: text,
    extensions: [language],
  });
  const code = state.doc.toString();
  const tree =
    ensureSyntaxTree(state, state.doc.length, SYNTAX_TREE_BUDGET_MS) ??
    syntaxTree(state);
  const highlighter = syntaxTagHighlighter(scheme, presetId);
  const lines: SyntaxToken[][] = [[]];
  highlightCode(
    code,
    tree,
    highlighter,
    (piece, color) => {
      if (!piece) return;
      lines[lines.length - 1]?.push({
        text: piece,
        ...(color ? { color } : {}),
      });
    },
    () => {
      lines.push([]);
    },
  );
  return lines;
}

/**
 * Tokenize both diff sides for one file, resolving the language from the path
 * first. Pure computation — runs inside the background worker.
 */
export async function highlightTexts(
  path: string,
  original: string,
  current: string,
  scheme: ColorScheme,
  presetId: string,
): Promise<{ original: SyntaxToken[][]; current: SyntaxToken[][] }> {
  const language = await languageForPath(path);
  return {
    original: highlightSource(original, language, scheme, presetId),
    current: highlightSource(current, language, scheme, presetId),
  };
}

let syntaxWorker: Worker | null = null;
let nextWorkerRequestId = 0;
const workerPendingRequests = new Map<
  number,
  {
    resolve: (result: { original: SyntaxToken[][]; current: SyntaxToken[][] }) => void;
    reject: (err: Error) => void;
  }
>();

function canUseSyntaxWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function getSyntaxWorker(): Worker | null {
  if (syntaxWorker) return syntaxWorker;
  if (!canUseSyntaxWorker()) return null;
  try {
    syntaxWorker = new Worker(
      new URL("./syntaxTokens.worker.ts", import.meta.url),
      { type: "module" },
    );
  } catch (err) {
    console.error("Failed to create syntax highlight worker:", err);
    return null;
  }
  syntaxWorker.onmessage = (
    e: MessageEvent<SyntaxTokensResponse>,
  ) => {
    const { id, original, current, error } = e.data;
    const pending = workerPendingRequests.get(id);
    if (!pending) return;
    workerPendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else if (original && current) {
      pending.resolve({ original, current });
    } else {
      pending.reject(new Error("Syntax highlight worker returned an empty response"));
    }
  };
  syntaxWorker.onerror = (e) => {
    console.error("Syntax highlight worker error:", e);
    const error = new Error("Syntax highlight worker error");
    for (const pending of workerPendingRequests.values()) {
      pending.reject(error);
    }
    workerPendingRequests.clear();
    syntaxWorker = null;
  };
  return syntaxWorker;
}

function runSyntaxHighlightInWorker(
  request: Omit<SyntaxTokensRequest, "id">,
): Promise<{ original: SyntaxToken[][]; current: SyntaxToken[][] }> {
  const worker = getSyntaxWorker();
  if (!worker) {
    return Promise.reject(new Error("Syntax highlight worker unavailable"));
  }
  const id = ++nextWorkerRequestId;
  return new Promise((resolve, reject) => {
    workerPendingRequests.set(id, { resolve, reject });
    worker.postMessage({ ...request, id } satisfies SyntaxTokensRequest);
  });
}

export function terminateSyntaxHighlightWorker(): void {
  if (syntaxWorker) {
    syntaxWorker.terminate();
    syntaxWorker = null;
    const error = new Error("Syntax highlight worker terminated");
    for (const pending of workerPendingRequests.values()) {
      pending.reject(error);
    }
    workerPendingRequests.clear();
  }
}

export async function highlightDiffFile(
  file: DiffFile,
  scheme: ColorScheme,
  presetId?: string,
): Promise<Map<UnifiedLine, SyntaxToken[]>> {
  const map = new Map<UnifiedLine, SyntaxToken[]>();
  if (file.binary || file.tooLarge) return map;

  const original: UnifiedLine[] = [];
  const current: UnifiedLine[] = [];
  let originalChars = 0;
  let currentChars = 0;
  for (const block of file.blocks) {
    for (const line of block.lines) {
      if (line.kind === "hunk") continue;
      if (line.kind !== "add") {
        original.push(line);
        originalChars += line.text.length + 1;
      }
      if (line.kind !== "del") {
        current.push(line);
        currentChars += line.text.length + 1;
      }
      // Rendering remains complete; only decorative parsing is skipped.
      if (
        originalChars > MAX_DIFF_HIGHLIGHT_CHARS ||
        currentChars > MAX_DIFF_HIGHLIGHT_CHARS
      ) {
        return map;
      }
    }
  }

  const originalText = original.map((line) => line.text).join("\n");
  const currentText = current.map((line) => line.text).join("\n");
  if (!originalText && !currentText) return map;

  const preset = presetId ?? loadThemePresetId();
  let result: { original: SyntaxToken[][]; current: SyntaxToken[][] } | null =
    null;
  if (canUseSyntaxWorker()) {
    try {
      result = await runSyntaxHighlightInWorker({
        path: file.path,
        original: originalText,
        current: currentText,
        scheme,
        presetId: preset,
      });
    } catch (err) {
      console.warn("Syntax highlight worker failed, falling back inline:", err);
      result = null;
    }
  }
  if (!result) {
    result = await highlightTexts(
      file.path,
      originalText,
      currentText,
      scheme,
      preset,
    );
  }
  assignLineTokens(
    map,
    original,
    result.original,
    (line) => line.kind === "del",
  );
  assignLineTokens(map, current, result.current, (line) => line.kind !== "del");
  return map;
}

function assignLineTokens(
  map: Map<UnifiedLine, SyntaxToken[]>,
  lines: readonly UnifiedLine[],
  tokens: readonly SyntaxToken[][],
  take: (line: UnifiedLine) => boolean,
) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!take(line)) continue;
    const pieces = tokens[index];
    map.set(
      line,
      pieces && joinText(pieces) === line.text ? pieces : [{ text: line.text }],
    );
  }
}

function unstyledLines(text: string): SyntaxToken[][] {
  return text.split("\n").map((line) => (line ? [{ text: line }] : []));
}

function joinText(tokens: readonly SyntaxToken[]): string {
  return tokens.map((token) => token.text).join("");
}