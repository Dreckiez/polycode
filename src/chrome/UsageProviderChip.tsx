import { useEffect, useRef, useState } from "react";
import {
  clampUsedPercent,
  formatRateLimitWindowChipLabel,
  formatUsagePercent,
  rateLimitWindowTooltip,
  type ProviderRateLimits,
  type RateLimitResetCredit,
  type RateLimitWindow,
} from "../lib/rateLimits";
import type { CodexRateLimitResetOutcome } from "../lib/rateLimitsFetch";
import { projectKey, projectName } from "../lib/paths";
import { HARNESS_TITLE } from "../lib/session";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupMascot,
} from "../lib/tabGroups";
import type { ProviderAccount } from "../lib/providerAccounts";
import { HarnessIcon } from "./HarnessIcon";
import { Popover, type PopoverDismissReason } from "./Popover";
import type { ProviderSignInState } from "./ProviderSignInPanel";
import { UsagePanel } from "./UsagePanel";

export type UsageWindowEntry = {
  key: "session" | "weekly" | "monthly";
  window: RateLimitWindow;
};

export type ResetActionState =
  "idle" | "confirming" | "using" | CodexRateLimitResetOutcome | "error";

export function UsageProviderChip({
  limits,
  now,
  project,
  accounts = [],
  accountId,
  onSelectAccount,
  onAddAccount,
  onConsumeReset,
  onReconnect,
}: {
  limits: ProviderRateLimits;
  now: number;
  project?: string;
  accounts?: ProviderAccount[];
  accountId?: string;
  onSelectAccount?: (accountId: string) => void;
  onAddAccount?: (label: string) => Promise<ProviderAccount>;
  onConsumeReset?: (creditId?: string) => Promise<CodexRateLimitResetOutcome>;
  onReconnect?: () => Promise<void>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [accountView, setAccountView] = useState<"usage" | "accounts" | "add">(
    "usage",
  );
  const [resetAction, setResetAction] = useState<ResetActionState>("idle");
  const [activeResetKey, setActiveResetKey] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [reconnectState, setReconnectState] =
    useState<ProviderSignInState>("idle");
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const loading =
    limits.status === "idle" ||
    (limits.status === "fetching" &&
      !limits.session &&
      !limits.weekly &&
      !limits.monthly);
  const disconnected = limits.status === "unavailable";
  const windows = usageWindows(limits);
  const loginView = Boolean(
    onReconnect &&
    windows.length === 0 &&
    (needsProviderLogin(limits) || reconnectState !== "idle"),
  );
  const showsRemaining = windows.some(
    (entry) => entry.window.remainingPercent != null,
  );
  const primaryWindow = limits.session ?? windows[0]?.window;
  const tightest = windows.reduce<RateLimitWindow | null>((best, entry) => {
    if (!best) return entry.window;
    if (showsRemaining) {
      const bestRem =
        best.remainingPercent ?? clampUsedPercent(100 - best.usedPercent);
      const entryRem =
        entry.window.remainingPercent ??
        clampUsedPercent(100 - entry.window.usedPercent);
      return entryRem < bestRem ? entry.window : best;
    }
    return entry.window.usedPercent > best.usedPercent ? entry.window : best;
  }, null);
  const tooltip = windows
    .map((entry) => rateLimitWindowTooltip(entry.window, now))
    .join(" · ");
  const providerLabel = HARNESS_TITLE[limits.provider];
  const activeAccount = accounts.find((account) => account.id === accountId);
  const canManageAccounts = Boolean(
    activeAccount && onSelectAccount && onAddAccount,
  );
  const mascotProject = project ? projectName(project) : providerLabel;
  const appearanceKey = project ? projectKey(project) : mascotProject;
  const mascotName = resolveTabGroupMascot(
    appearanceKey,
    loadTabGroupMascots(),
  );
  const mascotColor = resolveTabGroupColor(
    appearanceKey,
    loadTabGroupColors(),
    loadTabGroupCustomColors(),
    mascotProject,
  );

  useEffect(() => {
    if (open) return;
    setResetAction("idle");
    setActiveResetKey(null);
    setResetError(null);
    setReconnectState("idle");
    setReconnectError(null);
    setAccountView("usage");
  }, [open]);

  const dismiss = (reason: PopoverDismissReason) => {
    setOpen(false);
    if (reason === "escape") {
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };

  const useReset = async (
    credit: RateLimitResetCredit | undefined,
    rowKey: string,
  ) => {
    if (!onConsumeReset) return;
    setActiveResetKey(rowKey);
    setResetAction("using");
    setResetError(null);
    try {
      setResetAction(await onConsumeReset(credit?.id));
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "Could not use this reset",
      );
      setResetAction("error");
    }
  };

  const reconnect = async () => {
    if (!onReconnect) return;
    setReconnectState("running");
    setReconnectError(null);
    try {
      await onReconnect();
      setReconnectState("complete");
    } catch (error) {
      setReconnectError(
        error instanceof Error ? error.message : "Could not complete sign-in",
      );
      setReconnectState("error");
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="-mx-1 inline-flex h-5 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-1 text-content/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-content/10 hover:text-content focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]"
        aria-label={`${providerLabel} usage details`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          tooltip ||
          limits.error ||
          (disconnected
            ? "Not connected"
            : loading
              ? "Loading usage…"
              : "Usage details")
        }
        onClick={() => setOpen((value) => !value)}
      >
        <HarnessIcon harness={limits.provider} className="size-3 shrink-0" />
        {loading ? (
          <span className="animate-pulse text-content/35">···</span>
        ) : disconnected ? (
          <span className="text-content/35">not connected</span>
        ) : windows.length === 0 ? (
          <span className="text-content/35">{emptyUsageLabel(limits)}</span>
        ) : (
          <>
            {accounts.length > 1 && activeAccount ? (
              <span className="max-w-24 truncate text-content/45">
                {activeAccount.label}
              </span>
            ) : null}
            {tightest || primaryWindow ? (
              <MiniBar
                usedPct={
                  showsRemaining
                    ? (primaryWindow?.remainingPercent ??
                      clampUsedPercent(100 - (primaryWindow?.usedPercent ?? 0)))
                    : (tightest?.usedPercent ?? 0)
                }
                mode={showsRemaining ? "remaining" : "used"}
              />
            ) : null}
            <span className="flex min-w-0 items-center gap-1 tabular-nums">
              {windows.map((entry, index) => {
                const displayPct =
                  entry.window.remainingPercent != null
                    ? entry.window.remainingPercent
                    : entry.window.usedPercent;
                return (
                  <span
                    key={entry.key}
                    className="inline-flex items-center gap-1"
                  >
                    {index > 0 ? (
                      <span className="text-content/25">·</span>
                    ) : null}
                    <span>
                      {formatUsagePercent(displayPct)}{" "}
                      {formatRateLimitWindowChipLabel(entry.window, now)}
                    </span>
                  </span>
                );
              })}
            </span>
          </>
        )}
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="top"
          align="start"
          gap={7}
          width={300}
          maxHeight={460}
          autoFocus
          onDismiss={dismiss}
          role="dialog"
          aria-label={`${providerLabel} usage details`}
          tabIndex={-1}
          className={`overflow-y-auto text-content ${accountView === "usage" && loginView ? "" : "p-2.5"}`}
        >
          <UsagePanel
            providerLabel={providerLabel}
            limits={limits}
            now={now}
            loading={loading}
            windows={windows}
            accounts={accounts}
            activeAccount={activeAccount}
            accountView={accountView}
            loginView={loginView}
            canManageAccounts={canManageAccounts}
            reconnectState={reconnectState}
            reconnectError={reconnectError}
            resetAction={resetAction}
            activeResetKey={activeResetKey}
            resetError={resetError}
            mascotProject={mascotProject}
            mascotName={mascotName}
            mascotColor={mascotColor}
            canUse={Boolean(onConsumeReset)}
            onAddAccount={onAddAccount}
            onViewChange={setAccountView}
            onSelectAccount={(nextAccountId) => {
              onSelectAccount?.(nextAccountId);
              setOpen(false);
            }}
            onReconnect={() => void reconnect()}
            onUseReset={useReset}
            onConfirmReset={(rowKey) => {
              setActiveResetKey(rowKey);
              setResetAction("confirming");
            }}
            onCancelReset={() => {
              setActiveResetKey(null);
              setResetAction("idle");
            }}
            onClose={() => setOpen(false)}
          />
        </Popover>
      ) : null}
    </>
  );
}

function usageWindows(limits: ProviderRateLimits): UsageWindowEntry[] {
  return [
    limits.session
      ? ({ key: "session", window: limits.session } as const)
      : null,
    limits.weekly ? ({ key: "weekly", window: limits.weekly } as const) : null,
    limits.monthly
      ? ({ key: "monthly", window: limits.monthly } as const)
      : null,
  ].filter((entry): entry is UsageWindowEntry => entry != null);
}

export function needsProviderLogin(limits: ProviderRateLimits): boolean {
  if (limits.status === "unavailable") return true;
  if (limits.status !== "error") return false;
  const text = limits.error?.toLowerCase() ?? "";
  return (
    text.includes("expired") ||
    text.includes("sign-in") ||
    text.includes("not signed in") ||
    text.includes("not connected") ||
    text.includes("authentication")
  );
}

function emptyUsageLabel(limits: ProviderRateLimits): string {
  if (limits.status !== "error") return "—";
  const text = limits.error?.toLowerCase() ?? "";
  if (text.includes("expired") || text.includes("sign-in")) return "expired";
  return "—";
}

function MiniBar({
  usedPct,
  mode = "used",
}: {
  usedPct: number;
  mode?: "used" | "remaining";
}) {
  const pct = clampUsedPercent(usedPct);
  return (
    <span
      className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-content/10"
      aria-hidden
    >
      <span
        className={`block h-full rounded-full ${
          mode === "remaining" ? remainingBarClass(pct) : barClass(pct)
        }`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function remainingBarClass(pct: number): string {
  if (pct <= 10) return "bg-red-400";
  if (pct <= 20) return "bg-amber-400";
  return "bg-content/45";
}

export function barClass(pct: number): string {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-content/45";
}