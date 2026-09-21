import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { newTab, type WorkspaceTab } from "../lib/layout";
import { projectName } from "../lib/paths";
import { insertTabBesideActive } from "../lib/tabGroups";
import { DEFAULT_PROVIDER_ACCOUNT_ID } from "../lib/providerAccounts";
import { newSession, type Session } from "../lib/session";
import type { RateLimitProvider } from "../lib/rateLimits";

export type TabIterationDeps = {
  active: Session | undefined;
  activeTabIdRef: RefObject<string>;
  projectOfTab: (id: string) => string | undefined;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
};

export function useTabIteration(deps: TabIterationDeps) {
  const d = deps;

  /** `cwd` scopes group inheritance: a tab from another project starts alone. */
  const appendTab = useCallback(
    (tab: WorkspaceTab, cwd?: string) => {
      d.setTabs((prev) =>
        insertTabBesideActive(prev, tab, d.activeTabIdRef.current, (id) =>
          id === tab.id
            ? cwd
              ? projectName(cwd)
              : undefined
            : d.projectOfTab(id),
        ),
      );
    },
    [d.projectOfTab],
  );

  const onSelectProviderAccount = useCallback(
    (provider: RateLimitProvider, accountId: string) => {
      const active = d.active;
      if (!active || active.harness !== provider) return;
      const currentId = active.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID;
      if (currentId === accountId) return;

      if (active.blocks.length === 0 && !active.busy) {
        d.setSessions((current) =>
          current.map((session) =>
            session.id === active.id
              ? { ...session, providerAccountId: accountId }
              : session,
          ),
        );
        return;
      }

      // Provider thread ids are account-owned. Keep the current conversation
      // pinned to its account and open a clean one for the selected profile.
      const session = {
        ...newSession(
          active.harness,
          active.cwd,
          active.model,
          active.runtimeMode,
          active.modelSettings,
        ),
        providerAccountId: accountId,
      };
      const tab = newTab(session.id);
      d.setSessions((current) => [...current, session]);
      appendTab(tab, active.cwd);
      d.setActiveTabId(tab.id);
      d.setComposerFocused(true);
    },
    [d.active, appendTab],
  );

  return {
    appendTab,
    onSelectProviderAccount,
  };
}