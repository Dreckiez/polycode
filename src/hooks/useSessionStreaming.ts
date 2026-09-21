import { useCallback } from "react";
import type { Session } from "../lib/session";

export type SessionStreamingDeps = {
  getAndClearSessionLiveText: (
    sessionId: string,
  ) => Record<string, string>;
};

export function useSessionStreaming(deps: SessionStreamingDeps) {
  const d = deps;

  const flushSessionLiveText = useCallback(
    (sessionId: string, session: Session): Session => {
      const liveTextMap = d.getAndClearSessionLiveText(sessionId);
      if (Object.keys(liveTextMap).length === 0) return session;
      const blocks = session.blocks.map((block) => {
        const liveText = liveTextMap[block.id];
        if (liveText && (block.role === "assistant" || block.role === "reasoning") && block.streaming) {
          return { ...block, text: liveText, streaming: false };
        }
        return block;
      });
      return { ...session, blocks };
    },
    [],
  );

  return { flushSessionLiveText };
}