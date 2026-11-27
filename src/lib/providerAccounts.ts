import { pathKey } from "./paths";
import type { RateLimitProvider } from "./rateLimits";

const ACCOUNTS_KEY = "polycode.providerAccounts.v1";
const SELECTIONS_KEY = "polycode.providerAccountSelections.v1";
const CHANGE_EVENT = "polycode-provider-accounts-changed";

export const DEFAULT_PROVIDER_ACCOUNT_ID = "default";
const DEFAULT_PROVIDER_ACCOUNT_LABEL = "Default account";

export const PROVIDER_ACCOUNT_PROVIDERS = ["claude", "codex"] as const;
export const REMOVED_PROVIDER_ACCOUNT_MESSAGE =
  "This conversation uses a removed account. Switch accounts from the usage menu to start a new conversation.";

export type ProviderAccount = {
  id: string;
  provider: RateLimitProvider;
  label: string;
  isDefault?: boolean;
};

type StoredAccounts = Partial<Record<RateLimitProvider, ProviderAccount[]>>;
type StoredSelections = Record<
  string,
  Partial<Record<RateLimitProvider, string>>
>;

export function providerAccounts(
  provider: RateLimitProvider,
): ProviderAccount[] {
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  const seen = new Set<string>([DEFAULT_PROVIDER_ACCOUNT_ID]);
  const accounts = Array.isArray(stored[provider]) ? stored[provider] : [];
  const defaultLabel = cleanLabel(
    accounts.find((account) => account?.id === DEFAULT_PROVIDER_ACCOUNT_ID)?.label,
  );
  const profiles = accounts.flatMap((account) => {
    const id = validAccountId(account?.id) ? account.id : "";
    const label = cleanLabel(account?.label);
    if (!id || id === DEFAULT_PROVIDER_ACCOUNT_ID || !label || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ id, provider, label }];
  });
  return [
    {
      id: DEFAULT_PROVIDER_ACCOUNT_ID,
      provider,
      label: defaultLabel || DEFAULT_PROVIDER_ACCOUNT_LABEL,
      isDefault: true,
    },
    ...profiles,
  ];
}

export function newProviderAccount(
  provider: RateLimitProvider,
  label: string,
): ProviderAccount {
  return {
    id: `account-${crypto.randomUUID()}`,
    provider,
    label:
      cleanLabel(label) || `Account ${providerAccounts(provider).length + 1}`,
  };
}

export function saveProviderAccount(account: ProviderAccount): void {
  if (
    account.id === DEFAULT_PROVIDER_ACCOUNT_ID ||
    !validAccountId(account.id)
  ) {
    return;
  }
  const label = cleanLabel(account.label);
  if (!label) return;
  const accounts = providerAccounts(account.provider);
  storeAccounts(account.provider, [
    ...accounts.filter((entry) => entry.id !== account.id),
    { id: account.id, provider: account.provider, label },
  ]);
  announceChange();
}

export function renameProviderAccount(
  provider: RateLimitProvider,
  accountId: string,
  label: string,
): boolean {
  const accounts = providerAccounts(provider);
  const nextLabel = cleanLabel(label);
  if (!nextLabel || !accounts.some((account) => account.id === accountId)) {
    return false;
  }
  storeAccounts(
    provider,
    accounts.map((account) =>
      account.id === accountId ? { ...account, label: nextLabel } : account,
    ),
  );
  announceChange();
  return true;
}

/** Update the saved profiles only after native credential cleanup succeeds. */
export function removeProviderAccount(
  provider: RateLimitProvider,
  accountId: string,
): void {
  if (accountId === DEFAULT_PROVIDER_ACCOUNT_ID || !validAccountId(accountId)) {
    return;
  }
  storeAccounts(
    provider,
    providerAccounts(provider).filter((account) => account.id !== accountId),
  );
  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  for (const [key, selection] of Object.entries(selections)) {
    if (!isRecord(selection) || selection[provider] !== accountId) continue;
    delete selection[provider];
    if (Object.keys(selection).length === 0) delete selections[key];
  }
  writeJson(SELECTIONS_KEY, selections);
  announceChange();
}

function storeAccounts(
  provider: RateLimitProvider,
  accounts: ProviderAccount[],
): void {
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  stored[provider] = accounts
    .filter((account) =>
      !account.isDefault || account.label !== DEFAULT_PROVIDER_ACCOUNT_LABEL,
    )
    .map(({ id, label }) => ({ id, provider, label }));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(stored));
}

export function isProviderAccountRemoved(
  provider: RateLimitProvider,
  accountId: string | undefined,
): boolean {
  return Boolean(
    accountId &&
    accountId !== DEFAULT_PROVIDER_ACCOUNT_ID &&
    !providerAccounts(provider).some((account) => account.id === accountId),
  );
}

export function selectedProviderAccountId(
  provider: RateLimitProvider,
  project: string | undefined,
): string {
  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  const id = selections[selectionKey(project)]?.[provider];
  return providerAccounts(provider).some((account) => account.id === id)
    ? id!
    : DEFAULT_PROVIDER_ACCOUNT_ID;
}

export function selectProviderAccount(
  provider: RateLimitProvider,
  project: string | undefined,
  accountId: string,
): void {
  if (!providerAccounts(provider).some((account) => account.id === accountId)) {
    return;
  }
  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  const key = selectionKey(project);
  selections[key] = { ...selections[key], [provider]: accountId };
  writeJson(SELECTIONS_KEY, selections);
  announceChange();
}

export function providerAccountLabel(
  provider: RateLimitProvider,
  accountId: string | undefined,
): string {
  return (
    providerAccounts(provider).find(
      (account) => account.id === (accountId ?? DEFAULT_PROVIDER_ACCOUNT_ID),
    )?.label ?? "Removed account"
  );
}

export function subscribeProviderAccounts(listener: () => void): () => void {
  const local = () => listener();
  const storage = (event: StorageEvent) => {
    if (event.key === ACCOUNTS_KEY || event.key === SELECTIONS_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener("storage", storage);
  };
}

function selectionKey(project: string | undefined): string {
  return pathKey(project?.trim() || "~");
}

function cleanLabel(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 48)
    : "";
}

function validAccountId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function readRecord<T>(key: string): T {
  const value = readJson<unknown>(key, {});
  return isRecord(value) ? (value as T) : ({} as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private or full storage area should not block the provider itself.
  }
}

function announceChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
