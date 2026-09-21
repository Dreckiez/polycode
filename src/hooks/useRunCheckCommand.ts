import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  canDispatchQueuedHead,
  dequeueQueuedMessage,
  queuedMessageForSubmit,
} from "../lib/messageQueue";
import { CONTINUE_PROMPT } from "../lib/inFlight";
import { type HandoffComposerCard } from "../lib/handoff";
import { type NoteComposerCard } from "../lib/notes";
import { type FollowUpBehavior } from "../lib/settings";
import {
  type Attachment,
  type Session,
  type TurnIntent,
} from "../lib/session";

export type RunCheckCommandDeps = {
  sessions: Session[];
  sessionsRef: RefObject<Session[]>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  queueDispatchingRef: RefObject<Set<string>>;
  onSubmit: (
    sessionId: string,
    text: string,
    attachments?: Attachment[],
    options?: {
      followUpBehavior?: FollowUpBehavior;
      noteCard?: NoteComposerCard;
      handoffCard?: HandoffComposerCard;
      queuedMessageId?: string;
      intent?: TurnIntent;
    },
  ) => void;
};

export function useRunCheckCommand(deps: RunCheckCommandDeps) {
  const d = deps;

  useEffect(() => {
    const timers: number[] = [];
    const scheduled = new Set<string>();
    for (const session of d.sessions) {
      const queued = session.queuedMessages ?? [];
      if (session.busy || queued.length === 0) continue;

      if (session.queueStatus === "resuming") {
        d.setSessions((prev) =>
          prev.map((entry) =>
            entry.id === session.id
              ? { ...entry, queueStatus: "active" }
              : entry,
          ),
        );
        continue;
      }
      if (
        !canDispatchQueuedHead(session) ||
        d.queueDispatchingRef.current.has(session.id)
      ) {
        continue;
      }

      const next = queued[0];
      if (!next) continue;
      d.queueDispatchingRef.current.add(session.id);
      scheduled.add(session.id);
      timers.push(
        window.setTimeout(() => {
          d.queueDispatchingRef.current.delete(session.id);
          const latest = d.sessionsRef.current.find(
            (entry) => entry.id === session.id,
          );
          const head = latest?.queuedMessages?.[0];
          if (
            !latest ||
            !head ||
            head.id !== next.id ||
            !canDispatchQueuedHead(latest)
          ) {
            return;
          }
          d.onSubmit(session.id, head.text, head.attachments, {
            queuedMessageId: head.id,
            noteCard: head.noteCard,
            handoffCard: head.handoffCard,
            intent: head.intent,
          });
        }, 0),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const id of scheduled) d.queueDispatchingRef.current.delete(id);
    };
  }, [d.onSubmit, d.sessions]);

  const onDeleteQueuedMessage = useCallback(
    (sessionId: string, messageId: string) => {
      d.setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? dequeueQueuedMessage(session, messageId)
            : session,
        ),
      );
    },
    [],
  );

  const onQueuedMessageEditingChange = useCallback(
    (sessionId: string, messageId?: string) => {
      d.setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, editingQueuedMessageId: messageId }
            : session,
        ),
      );
    },
    [],
  );

  const onEditQueuedMessage = useCallback(
    (sessionId: string, messageId: string, text: string) => {
      d.setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                queuedMessages: session.queuedMessages?.map((message) =>
                  message.id === messageId ? { ...message, text } : message,
                ),
                editingQueuedMessageId: undefined,
              }
            : session,
        ),
      );
    },
    [],
  );

  const onSteerQueuedMessage = useCallback(
    (sessionId: string, messageId: string) => {
      const session = d.sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const message = session
        ? queuedMessageForSubmit(session, messageId, "steer")
        : undefined;
      if (!session || !message) return;
      d.onSubmit(sessionId, message.text, message.attachments, {
        followUpBehavior: "steer",
        queuedMessageId: message.id,
        noteCard: message.noteCard,
        handoffCard: message.handoffCard,
      });
    },
    [d.onSubmit],
  );

  const onResumeQueue = useCallback(
    (sessionId: string) => {
      const session = d.sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      if (
        !session ||
        session.busy ||
        session.queueStatus !== "paused" ||
        !session.queuedMessages?.length
      ) {
        return;
      }
      d.setSessions((prev) =>
        prev.map((entry) =>
          entry.id === sessionId
            ? { ...entry, queueStatus: "resuming" }
            : entry,
        ),
      );
      d.onSubmit(sessionId, CONTINUE_PROMPT, [], {
        followUpBehavior: "steer",
      });
    },
    [d.onSubmit],
  );

  return {
    onDeleteQueuedMessage,
    onQueuedMessageEditingChange,
    onEditQueuedMessage,
    onSteerQueuedMessage,
    onResumeQueue,
  };
}