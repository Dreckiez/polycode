import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useState, type FormEvent } from "react";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { Plus } from "../chrome/icons";
import { loginHarness } from "../lib/harness/auth";
import {
  newProviderAccount,
  PROVIDER_ACCOUNT_PROVIDERS,
  providerAccounts,
  removeProviderAccount,
  renameProviderAccount,
  saveProviderAccount,
  subscribeProviderAccounts,
  type ProviderAccount,
} from "../lib/providerAccounts";
import { HARNESS_TITLE } from "../lib/session";
import { Heading, SecondaryButton } from "./SettingsControls";

type AccountProvider = (typeof PROVIDER_ACCOUNT_PROVIDERS)[number];
type AccountEditor = {
  provider: AccountProvider;
  accountId?: string;
  label: string;
};

export function SettingsProviderAccounts() {
  const [, setVersion] = useState(0);
  const [editor, setEditor] = useState<AccountEditor | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeProviderAccounts(() => setVersion((value) => value + 1)),
    [],
  );

  const edit = (next: AccountEditor | null) => {
    setError(null);
    setEditor(next);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor?.label.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      if (editor.accountId) {
        if (!renameProviderAccount(editor.provider, editor.accountId, editor.label)) {
          throw new Error("This account is no longer available.");
        }
      } else {
        const account = newProviderAccount(editor.provider, editor.label);
        await loginHarness(editor.provider, account.id);
        saveProviderAccount(account);
      }
      setEditor(null);
    } catch (caught) {
      setError(String(caught instanceof Error ? caught.message : caught));
    } finally {
      setWorking(false);
    }
  };

  const remove = async (account: ProviderAccount) => {
    if (working || account.isDefault) return;
    setWorking(true);
    setError(null);
    try {
      const confirmed = await ask(
        `Remove “${account.label}”? PolyCode will delete the local profile folder and stop any running turns for this account. Conversations will stay in PolyCode history.`,
        {
          title: `Remove ${HARNESS_TITLE[account.provider]} account`,
          kind: "warning",
          okLabel: "Remove account",
          cancelLabel: "Cancel",
        },
      );
      if (!confirmed) return;
      await invoke("provider_account_remove", {
        provider: account.provider,
        accountId: account.id,
      });
      removeProviderAccount(account.provider, account.id);
      if (editor?.provider === account.provider && editor.accountId === account.id) {
        setEditor(null);
      }
    } catch (caught) {
      setError(String(caught instanceof Error ? caught.message : caught));
    } finally {
      setWorking(false);
    }
  };

  const renderEditor = (current: AccountEditor) => (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-content/6 px-4 py-2.5"
      onSubmit={save}
    >
      <input
        autoFocus
        aria-label={`${current.accountId ? "Rename" : "New"} ${HARNESS_TITLE[current.provider]} account`}
        className="min-w-36 flex-1 rounded-lg border border-content/10 bg-content/5 px-3 py-1.5 text-[13px] outline-none focus-visible:border-accent"
        disabled={working}
        maxLength={48}
        placeholder="Work or Personal"
        value={current.label}
        onChange={(event) => setEditor({ ...current, label: event.target.value })}
      />
      <SecondaryButton disabled={working} onClick={() => edit(null)}>
        Cancel
      </SecondaryButton>
      <button
        type="submit"
        disabled={working || !current.label.trim()}
        className="cursor-pointer rounded-lg bg-content px-3 py-1.5 text-[13px] font-medium text-background-base hover:bg-content/85 disabled:cursor-default disabled:opacity-40"
      >
        {current.accountId ? "Save" : working ? "Waiting for sign-in…" : "Sign in and add"}
      </button>
    </form>
  );

  return (
    <section aria-labelledby="provider-accounts" className="mb-8">
      <Heading id="provider-accounts" title="Accounts" first />
      <p className="mb-4 text-[13px] text-content/50">
        Manage saved profiles here and switch between them from the usage menu in the footer.
      </p>
      <div className="grid gap-3">
        {PROVIDER_ACCOUNT_PROVIDERS.map((provider) => {
          const current = editor?.provider === provider ? editor : null;
          return (
            <div key={provider} className="overflow-hidden rounded-xl border border-content/10">
              <div className="flex items-center gap-2.5 px-4 py-3">
                <HarnessIcon harness={provider} className="size-4 shrink-0" />
                <h3 className="min-w-0 flex-1 text-[13px] font-semibold">
                  {HARNESS_TITLE[provider]}
                </h3>
                <SecondaryButton disabled={working} onClick={() => edit({ provider, label: "" })}>
                  <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
                  Add account
                </SecondaryButton>
              </div>
              {providerAccounts(provider).map((account) => (
                <div key={account.id}>
                  {current?.accountId === account.id ? renderEditor(current) : (
                    <div className="flex flex-wrap items-center gap-2 border-t border-content/6 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">{account.label}</p>
                        {account.isDefault ? (
                          <p className="text-[11px] text-content/45">Default CLI profile</p>
                        ) : null}
                      </div>
                      <SecondaryButton
                        disabled={working}
                        title={`Rename ${account.label}`}
                        onClick={() => edit({ provider, accountId: account.id, label: account.label })}
                      >
                        Rename
                      </SecondaryButton>
                      {!account.isDefault ? (
                        <SecondaryButton
                          danger
                          disabled={working}
                          title={`Remove ${account.label}`}
                          onClick={() => void remove(account)}
                        >
                          Remove
                        </SecondaryButton>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {current && !current.accountId ? renderEditor(current) : null}
            </div>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 text-[13px] text-red-400">{error}</p> : null}
    </section>
  );
}
