import { useCallback, type RefObject } from "react";
import {
  keepHarnessQuestionOpen,
  respondHarnessApproval,
  respondHarnessQuestion,
  type ApprovalDecision,
  type UserQuestionReply,
} from "../lib/harness";
import { type Session } from "../lib/session";

export type ApprovalHandlersDeps = {
  sessionsRef: RefObject<Session[]>;
};

export function useApprovalHandlers(deps: ApprovalHandlersDeps) {
  const d = deps;

  const onApproval = useCallback(
    (sessionId: string, requestId: number, decision: ApprovalDecision) => {
      const session = d.sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) return;
      respondHarnessApproval(session.harness, sessionId, requestId, decision);
    },
    [],
  );

  const onQuestionReply = useCallback(
    (sessionId: string, requestId: number, reply: UserQuestionReply) => {
      const session = d.sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) return;
      respondHarnessQuestion(session.harness, sessionId, requestId, reply);
    },
    [],
  );

  const onQuestionInteraction = useCallback(
    (sessionId: string, requestId: number) => {
      const session = d.sessionsRef.current.find((s) => s.id === sessionId);
      if (session) keepHarnessQuestionOpen(session.harness, sessionId, requestId);
    },
    [],
  );

  return {
    onApproval,
    onQuestionReply,
    onQuestionInteraction,
  };
}