import { create } from "zustand";

/**
 * Live streaming-text store.
 *
 * The assistant token hot path (60–120 deltas/sec) writes HERE and nowhere
 * else on the per-token critical path. The canonical session tree in App is
 * only touched at coarse milestones (turn start / seal / plan status), so a
 * per-token append no longer re-renders the title bar, sidebar, or the
 * background tabs.
 *
 * Leaf reads use a NARROW selector (`liveTextByBlock`) returning a primitive
 * string, so a token that lands in block B re-subscribes only the component
 * that rendered block B's text; the rest of the tree stays still.
 *
 * The live text deliberately mirrors the canonical `blocks` slice: it is the
 * streaming-only overlay, still authoritative for display while `streaming`
 * is true. The canonical text and persistence are untouched by this store.
 */

export interface LiveTextEntry {
  sessionId: string;
  blockId: string;
}

export interface LiveTextState {
  liveText: Record<string, Record<string, string>>;
}

export const useChatStore = create<LiveTextState>()(() => ({
  liveText: {},
}));

export function appendLiveText(entry: LiveTextEntry, delta: string): void {
  if (!delta) return;
  useChatStore.setState((state) => {
    const session = state.liveText[entry.sessionId] ?? {};
    const previous = session[entry.blockId] ?? "";
    return {
      liveText: {
        ...state.liveText,
        [entry.sessionId]: { ...session, [entry.blockId]: previous + delta },
      },
    };
  });
}

export function setLiveText(entry: LiveTextEntry, text: string): void {
  useChatStore.setState((state) => {
    const session = state.liveText[entry.sessionId] ?? {};
    return {
      liveText: {
        ...state.liveText,
        [entry.sessionId]: { ...session, [entry.blockId]: text },
      },
    };
  });
}

export function clearSessionLiveText(sessionId: string): void {
  useChatStore.setState((state) => {
    if (!(sessionId in state.liveText)) return state;
    const next = { ...state.liveText };
    delete next[sessionId];
    return { liveText: next };
  });
}

export function clearBlockLiveText(entry: LiveTextEntry): void {
  useChatStore.setState((state) => {
    const session = state.liveText[entry.sessionId];
    if (!session || !(entry.blockId in session)) return state;
    const nextSession = { ...session };
    delete nextSession[entry.blockId];
    const next = { ...state.liveText, [entry.sessionId]: nextSession };
    if (Object.keys(nextSession).length === 0) {
      delete next[entry.sessionId];
    }
    return { liveText: next };
  });
}

export function getAndClearSessionLiveText(sessionId: string): Record<string, string> {
  const state = useChatStore.getState();
  const session = state.liveText[sessionId];
  if (!session) return {};
  useChatStore.setState((state) => {
    const next = { ...state.liveText };
    delete next[sessionId];
    return { liveText: next };
  });
  return session;
}

export function resetChatStore(): void {
  useChatStore.setState({ liveText: {} });
}

/**
 * Narrow leaf selector. Returns the live streaming text for one block as a
 * primitive string, so components that read via this selector re-render only
 * when THIS block's text changes, not when a sibling block streams.
 */
export function liveTextByBlock(
  state: LiveTextState,
  entry: LiveTextEntry,
): string | undefined {
  return state.liveText[entry.sessionId]?.[entry.blockId];
}
