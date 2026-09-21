import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  displayAttachments,
  prepareAttachments,
} from "../lib/attachments";
import {
  userTurnCards,
  trackSessionEdits,
  nudgeWorkspace,
  nudgeOpenEditors,
  lastAssistantTextInTurn,
  withPlanStatus,
  withPlanBuildTarget,
} from "../lib/appSession";
import {
  appendUser,
  appendSteerUser,
  canSteerHarness,
  cancelHarnessTurn,
  forgetHarnessSession,
  generateHarnessTitle,
  isLiveHarness,
  promoteLastAssistantToPlan,
  sendHarnessTurn,
  steerHarnessTurn,
  stopHarnessSession,
  stopStreaming,
  type HarnessEvent,
} from "../lib/harness";
import {
  appendPreparingHandoff,
  buildDeterministicHandoff,
  chooseHandoffBrief,
  completeHandoff,
  consumeHandoff,
  handoffTurnCard,
  isPreparingHandoff,
  pendingHandoff,
  shouldAskOutgoingAgent,
  userMessagesAfterHandoff,
  wrapHandoffPrompt,
  type HandoffComposerCard,
} from "../lib/handoff";
import {
  beginSessionTurn,
  flushSessionCheckpoint,
  notifyReviewChanged,
} from "../lib/checkpoint";
import {
  canReplaceSessionTitle,
  formatSessionTitle,
  HARNESS_LABEL,
  sessionWorkCwd,
  titleFromPrompt,
  type Attachment,
  type PlanBuildTarget,
  type SecondOpinionMeta,
  type Session,
  type TurnIntent,
} from "../lib/session";
import {
  buildPlanPrompt,
  isProviderFailureText,
  planTurnPrompt,
} from "../lib/plan";
import { SECOND_OPINION_TITLE } from "../lib/secondOpinion";
import { composeNoteMessage, type NoteComposerCard } from "../lib/notes";
import { isNativeCommandPrompt } from "../lib/skills";
import {
  loadFollowUpBehavior,
  type FollowUpBehavior,
} from "../lib/settings";
import { selectedProviderAccountId } from "../lib/providerAccounts";
import { saveRecentModelChoice } from "../lib/models";
import { preparePrompt } from "../lib/promptPreparation";
import {
  dequeueQueuedMessage,
  queuedMessageForSubmit,
} from "../lib/messageQueue";
import { requestOutgoingHandoff } from "../lib/handoffTurn";
import { resolveLinkedWorkItem } from "../lib/sessionWorkItem";
import { CONTINUE_PROMPT } from "../lib/inFlight";
import { notifySession } from "../lib/notifications";
import { playCue } from "../lib/sounds";
import { notifyGitChanged } from "../lib/fs";
import { nudgeWatchedFiles } from "../lib/fileWatch";

type SubmitTurnOptions = {
  secondOpinion?: SecondOpinionMeta;
  followUpBehavior?: FollowUpBehavior;
  noteCard?: NoteComposerCard;
  handoffCard?: HandoffComposerCard;
  queuedMessageId?: string;
  intent?: TurnIntent;
  planBlockId?: string;
  buildTarget?: PlanBuildTarget;
};

export type SubmitTurnDeps = {
  activeSessionIdRef: RefObject<string | undefined>;
  enqueueHarnessEvent: (sessionId: string, event: HarnessEvent) => void;
  flushHarnessEvents: () => void;
  flushSessionLiveText: (sessionId: string, session: Session) => Session;
  removingSessionIds: RefObject<Set<string>>;
  sessionsRef: RefObject<Session[]>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  turnGen: RefObject<Map<string, number>>;
};

export function useSubmitTurn(deps: SubmitTurnDeps) {
  const d = deps;

  const onSubmit = useCallback(
    (
      sessionId: string,
      text: string,
      attachments: Attachment[] = [],
      options?: SubmitTurnOptions,
    ) => {
      if (d.removingSessionIds.current.has(sessionId)) return;
      const storedCurrent = d.sessionsRef.current.find((s) => s.id === sessionId);
      if (!storedCurrent) return;
      const current = options?.buildTarget
        ? withPlanBuildTarget(storedCurrent, options.buildTarget)
        : storedCurrent;
      const intent = options?.intent ?? "default";
      const approvedPlan = options?.planBlockId
        ? current.blocks.find(
            (block) =>
              block.id === options.planBlockId && block.role === "plan",
          )
        : undefined;
      if (intent === "build" && !approvedPlan?.text.trim()) return;
      if (options?.queuedMessageId) {
        const mode =
          options.followUpBehavior === "steer" ? "steer" : "dispatch";
        if (!queuedMessageForSubmit(current, options.queuedMessageId, mode)) {
          return;
        }
      }
      const noteCard =
        options && "noteCard" in options ? options.noteCard : current.noteCard;
      const handoffCard =
        options && "handoffCard" in options
          ? options.handoffCard
          : current.handoffCard;
      if (
        !text.trim() &&
        attachments.length === 0 &&
        !noteCard &&
        !handoffCard
      ) {
        return;
      }
      if (isPreparingHandoff(current)) return;
      saveRecentModelChoice(current.harness, current.model);
      const workCwd = sessionWorkCwd(current);
      const providerAccountId =
        current.harness === "claude" || current.harness === "codex"
          ? (current.providerAccountId ??
            selectedProviderAccountId(current.harness, current.cwd))
          : undefined;
      const submittedText = intent === "build" ? "Build approved plan" : text;
      const rawCommand = isNativeCommandPrompt(submittedText, current.harness);
      const harnessText = rawCommand
        ? submittedText
        : composeNoteMessage(noteCard, submittedText);

      const pendingSwitch =
        current.pendingSwitch && current.pendingSwitch.from !== current.harness
          ? current.pendingSwitch
          : null;

      if (current.busy && !pendingSwitch) {
        const followUpBehavior =
          intent === "plan"
            ? "queue"
            : (options?.followUpBehavior ?? loadFollowUpBehavior());
        if (followUpBehavior === "queue") {
          d.setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    noteCard: rawCommand ? s.noteCard : undefined,
                    handoffCard: rawCommand ? s.handoffCard : undefined,
                    queuedMessages: [
                      ...(s.queuedMessages ?? []),
                      {
                        id: crypto.randomUUID(),
                        text,
                        attachments,
                        noteCard,
                        handoffCard,
                        intent,
                      },
                    ],
                    queueStatus:
                      s.queueStatus === "paused" ? "paused" : "active",
                  }
                : s,
            ),
          );
          return;
        }
        if (
          !isLiveHarness(current.harness) ||
          !canSteerHarness(current.harness)
        ) {
          // Harnesses that cannot steer (fx) used to drop the message on the
          // floor here, so a follow-up sent mid-turn just vanished. Say so.
          d.enqueueHarnessEvent(sessionId, {
            type: "status",
            text: `${current.harness} cannot take a follow-up mid-turn — wait for this turn to finish, or stop it first.`,
          });
          d.flushHarnessEvents();
          return;
        }
        const visible = displayAttachments(attachments);
        const cards = userTurnCards(noteCard);
        d.setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            let next: Session = {
              ...s,
              noteCard: rawCommand ? s.noteCard : undefined,
              handoffCard: rawCommand ? s.handoffCard : undefined,
            };
            if (options?.queuedMessageId) {
              next = dequeueQueuedMessage(next, options.queuedMessageId);
            }
            return appendSteerUser(next, submittedText, visible, cards);
          }),
        );
        void (async () => {
          try {
            const prepared = await prepareAttachments(attachments);
            const prompt = await preparePrompt(harnessText, {
              harness: current.harness,
              sessionId,
              cwd: workCwd,
            });
            await steerHarnessTurn({
              harness: current.harness,
              sessionId,
              cwd: workCwd,
              model: current.model,
              modelSettings: current.modelSettings,
              text: prompt,
              attachments: prepared,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : `${current.harness} could not steer the active turn`;
            d.enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
            d.flushHarnessEvents();
          }
        })();
        return;
      }

      const gen = (d.turnGen.current.get(sessionId) ?? 0) + 1;
      d.turnGen.current.set(sessionId, gen);
      const isFirstTurn = current.blocks.length === 0;
      const placeholderTitle = canReplaceSessionTitle(
        current.title,
        current.harness,
        HARNESS_LABEL[current.harness],
      );
      const titleSeed =
        isFirstTurn &&
        !current.noteCard &&
        placeholderTitle
          ? titleFromPrompt(submittedText, current.harness, attachments)
          : current.title;
      const visible = displayAttachments(attachments);
      const card =
        options?.secondOpinion ??
        (handoffCard ? handoffTurnCard(handoffCard) : undefined);
      const visibleText =
        card?.kind === "handoff"
          ? submittedText
          : card
            ? SECOND_OPINION_TITLE
            : submittedText;
      const cards = rawCommand ? undefined : userTurnCards(noteCard, card);
      const live = isLiveHarness(current.harness);
      const queuedHandoff =
        live && !pendingSwitch ? pendingHandoff(current) : null;

      if (pendingSwitch && current.busy) {
        void cancelHarnessTurn(pendingSwitch.from, sessionId);
      }

      d.setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const selected = options?.buildTarget
            ? withPlanBuildTarget(s, options.buildTarget)
            : s;
          const titled = isFirstTurn ? titleSeed : selected.title;
          let next: Session = {
            ...selected,
            providerAccountId,
            noteCard: rawCommand ? s.noteCard : undefined,
            handoffCard: rawCommand ? s.handoffCard : undefined,
          };
          if (approvedPlan && intent === "build") {
            next = {
              ...next,
              blocks: next.blocks.map((block) =>
                block.id === approvedPlan.id
                  ? {
                      ...block,
                      plan: {
                        ...(block.plan ?? { status: "ready" as const }),
                        status: "building" as const,
                        approvedText: block.text,
                      },
                    }
                  : block,
              ),
            };
          }
          if (options?.queuedMessageId) {
            next = dequeueQueuedMessage(next, options.queuedMessageId);
          }
          if (!live) {
            return {
              ...next,
              title: titled,
              pendingSwitch: undefined,
              busy: false,
              blocks: [
                ...next.blocks,
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  text: visibleText,
                  ...(visible.length > 0 ? { attachments: visible } : {}),
                  ...cards,
                },
                {
                  id: crypto.randomUUID(),
                  role: "system",
                  text: `${next.harness} is not connected yet — install and sign in to that provider, then retry.`,
                },
              ],
            };
          }
          if (pendingSwitch) {
            const withLiveText = d.flushSessionLiveText(next.id, next);
            const sealed = stopStreaming({
              ...withLiveText,
              title: titled,
              pendingSwitch: undefined,
            });
            return appendUser(
              appendPreparingHandoff(sealed, pendingSwitch.from, next.harness),
              visibleText,
              visible,
              cards,
            );
          }
          return appendUser(
            { ...next, title: titled },
            visibleText,
            visible,
            cards,
          );
        }),
      );

      if (isFirstTurn && live && placeholderTitle) {
        const titleMessage =
          harnessText || attachments.map((file) => file.name).join(", ");
        void generateHarnessTitle(current.harness, {
          sessionId,
          cwd: workCwd,
          message: titleMessage,
          providerAccountId,
        })
          .then(async (generated) => {
            const linkedWorkItem = await resolveLinkedWorkItem(
              titleMessage,
              workCwd,
              generated?.workItem ?? null,
            );
            if (!generated && !linkedWorkItem) return;
            d.setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                let next = s;
                if (
                  generated &&
                  canReplaceSessionTitle(s.title, s.harness, titleSeed)
                ) {
                  next = {
                    ...next,
                    title: formatSessionTitle(s.harness, generated.title),
                  };
                }
                if (linkedWorkItem && !next.linkedWorkItem) {
                  next = { ...next, linkedWorkItem };
                }
                return next;
              }),
            );
          })
          .catch(() => undefined);
      }

      if (!live) {
        if (pendingSwitch) {
          void forgetHarnessSession(pendingSwitch.from, sessionId);
        }
        return;
      }

      void (async () => {
        let wrap = handoffCard
          ? {
              from: handoffCard.from,
              to: current.harness,
              text: handoffCard.brief,
            }
          : queuedHandoff;
        if (pendingSwitch) {
          let agentText = "";
          if (
            shouldAskOutgoingAgent(current) &&
            isLiveHarness(pendingSwitch.from)
          ) {
            try {
              agentText = await requestOutgoingHandoff({
                harness: pendingSwitch.from,
                sessionId,
                cwd: workCwd,
                model: pendingSwitch.fromModel,
                modelSettings: pendingSwitch.fromSettings,
                providerAccountId: pendingSwitch.fromProviderAccountId,
                userRequest: text,
              });
            } catch {
              agentText = "";
            }
          }
          if (d.turnGen.current.get(sessionId) !== gen) return;
          const latest = d.sessionsRef.current.find((s) => s.id === sessionId);
          const brief = chooseHandoffBrief(
            agentText,
            buildDeterministicHandoff(latest ?? current, text),
          );
          await forgetHarnessSession(pendingSwitch.from, sessionId);
          if (d.turnGen.current.get(sessionId) !== gen) return;
          wrap = { from: pendingSwitch.from, to: current.harness, text: brief };
        }

        const revealHandoff = (brief: string) => {
          d.setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId || !isPreparingHandoff(s)) return s;
              return { ...completeHandoff(s, brief), busy: true };
            }),
          );
        };

        const planEventKey = `turn:${gen}`;
        let nativePlanSeen = false;
        let providerFailureSeen = false;
        const routePlanEvent = (event: HarnessEvent): HarnessEvent | null => {
          if (event.type === "session.error") providerFailureSeen = true;
          if (intent !== "plan") return event;
          if (event.type === "plan") {
            nativePlanSeen = true;
            return {
              ...event,
              key: planEventKey,
            };
          }
          return event;
        };

        await beginSessionTurn(sessionId, workCwd).catch(() => undefined);
        if (d.turnGen.current.get(sessionId) !== gen) return;
        let buildSucceeded = false;
        try {
          const prepared = await prepareAttachments(attachments);
          const prompt =
            intent === "build" && approvedPlan
              ? buildPlanPrompt(approvedPlan.text)
              : await preparePrompt(harnessText, {
                  harness: current.harness,
                  sessionId,
                  cwd: workCwd,
                });
          const turnPrompt =
            intent === "plan" && !rawCommand ? planTurnPrompt(prompt) : prompt;
          const earlier = queuedHandoff
            ? userMessagesAfterHandoff(current)
            : [];
          await sendHarnessTurn({
            harness: current.harness,
            sessionId,
            cwd: workCwd,
            model: current.model,
            modelSettings: current.modelSettings,
            providerAccountId,
            runtimeMode: current.runtimeMode,
            intent,
            text:
              wrap && !rawCommand
                ? wrapHandoffPrompt(
                    wrap.text,
                    wrap.from,
                    turnPrompt.trim() || CONTINUE_PROMPT,
                    earlier,
                  )
                : turnPrompt,
            attachments: prepared,
            onEvent: (event) => {
              if (d.turnGen.current.get(sessionId) !== gen) return;
              if (
                wrap &&
                (event.type === "session.started" ||
                  event.type === "session.providerBound")
              ) {
                revealHandoff(wrap.text);
              }
              nudgeOpenEditors(event, workCwd);
              trackSessionEdits(sessionId, workCwd, event);
              const routed = routePlanEvent(event);
              if (routed) d.enqueueHarnessEvent(sessionId, routed);
            },
          });
          if (d.turnGen.current.get(sessionId) !== gen) return;
          if (wrap) {
            d.setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== sessionId) return s;
                const ready = isPreparingHandoff(s)
                  ? completeHandoff(s, wrap.text)
                  : s;
                // A command owns its arguments; deliver the recap with the next chat prompt.
                return rawCommand ? ready : consumeHandoff(ready);
              }),
            );
          }
          buildSucceeded = true;
        } catch (error: unknown) {
          if (d.turnGen.current.get(sessionId) !== gen) return;
          if (wrap) revealHandoff(wrap.text);
          const message =
            error instanceof Error
              ? error.message
              : `${current.harness} adapter failed`;
          if (!providerFailureSeen) {
            d.enqueueHarnessEvent(sessionId, {
              type: "session.error",
              message,
            });
          }
          providerFailureSeen = true;
        } finally {
          if (d.turnGen.current.get(sessionId) !== gen) return;
          d.flushHarnessEvents();
          // A failed provider can leave its process alive with a dead event
          // stream or poisoned turn state. Park it now; the next prompt will
          // reconnect and resume through a fresh transport.
          if (providerFailureSeen) {
            await stopHarnessSession(current.harness, sessionId).catch(
              () => undefined,
            );
          }
          await flushSessionCheckpoint(sessionId);
          d.setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sessionId) return s;
              const withLiveText = d.flushSessionLiveText(s.id, s);
              const stopped = stopStreaming(withLiveText);
              const providerFailed =
                providerFailureSeen ||
                isProviderFailureText(lastAssistantTextInTurn(stopped));
              const finalized =
                intent === "plan" && !nativePlanSeen && !providerFailed
                  ? promoteLastAssistantToPlan(stopped, planEventKey)
                  : stopped;
              return approvedPlan && intent === "build"
                ? withPlanStatus(
                    finalized,
                    approvedPlan.id,
                    buildSucceeded && !providerFailed ? "built" : "ready",
                  )
                : finalized;
            }),
          );
          // Next tick: the flush above has rendered by then, so the banner
          // quotes the reply's final text rather than the previous batch.
          window.setTimeout(() => {
            const finished = d.sessionsRef.current.find(
              (s) => s.id === sessionId,
            );
            const visible = sessionId === d.activeSessionIdRef.current;
            const sent = finished
              ? notifySession(finished, "finished", visible)
              : Promise.resolve(false);
            void sent.then((ok) => {
              if (!ok) playCue("turnFinished");
            });
          }, 0);
          notifyReviewChanged(sessionId);
          notifyGitChanged();
          nudgeWorkspace(workCwd);
          nudgeWatchedFiles();
          window.setTimeout(() => nudgeWatchedFiles(), 150);
        }
      })();
    },
    [d.enqueueHarnessEvent, d.flushHarnessEvents],
  );

  return { onSubmit };
}