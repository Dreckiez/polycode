import type { Block } from "./session";

const LEGACY_COMMAND = /^\s*\/(?:mono|monocode)(?=\s|$)\s*/i;

/** A submitted /operator turn keeps CLI access available in later turns. */
export function isOperatorUserTurn(block: Block): boolean {
  return (
    block.role === "user" &&
    !block.draft &&
    !block.internal &&
    // This persisted field keeps its original name for saved session compatibility.
    (block.monocode === true || LEGACY_COMMAND.test(block.text))
  );
}

/** Old command messages remain enabled and render without their old prefix. */
export function operatorUserPrompt(block: Block): string {
  const legacy = block.text.match(LEGACY_COMMAND);
  if (!legacy) return block.text;
  return (
    block.text.slice(legacy[0].length).trim() ||
    "Explain what you can do in MonoCode with the app CLI."
  );
}
