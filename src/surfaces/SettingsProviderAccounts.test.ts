// @vitest-environment happy-dom
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loginHarness } from "../lib/harness/auth";
import {
  DEFAULT_PROVIDER_ACCOUNT_ID,
  isProviderAccountRemoved,
  providerAccountLabel,
  providerAccounts,
  saveProviderAccount,
  selectedProviderAccountId,
  selectProviderAccount,
} from "../lib/providerAccounts";
import { SettingsProviderAccounts } from "./SettingsProviderAccounts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));
vi.mock("../lib/harness/auth", () => ({ loginHarness: vi.fn() }));

let container: HTMLDivElement;
let root: Root;

const work = { id: "account-work", provider: "codex", label: "Work" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  saveProviderAccount(work);
  selectProviderAccount("codex", "/repo", work.id);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(SettingsProviderAccounts, {
    providers: ["codex"],
  })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function getButton(title: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).not.toBeNull();
  return button!;
}

function enterAccountName(label: string) {
  const input = container.querySelector("input")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    input, label,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("shows account controls only for installed providers", () => {
  expect(Array.from(container.querySelectorAll("h3"), (heading) => heading.textContent))
    .toEqual(["Codex"]);

  act(() => root.render(createElement(SettingsProviderAccounts, { providers: [] })));
  expect(container.querySelector('[aria-labelledby="provider-accounts"]')).toBeNull();
});

it("renames an existing profile without signing in again or changing its selection", async () => {
  act(() => getButton("Rename Work").click());
  act(() => enterAccountName("Work workspace"));
  await act(async () => container.querySelector("form")?.requestSubmit());

  expect(providerAccountLabel("codex", work.id)).toBe("Work workspace");
  expect(selectedProviderAccountId("codex", "/repo")).toBe(work.id);
  expect(loginHarness).not.toHaveBeenCalled();
});

it("adds a separate Codex profile after browser sign-in succeeds", async () => {
  vi.mocked(loginHarness).mockResolvedValue(undefined);
  const codex = Array.from(container.querySelectorAll("h3"))
    .find((heading) => heading.textContent === "Codex");
  act(() => codex?.parentElement?.querySelector("button")?.click());
  act(() => enterAccountName("Personal"));
  await act(async () => container.querySelector("form")?.requestSubmit());

  const saved = providerAccounts("codex").find(({ label }) => label === "Personal");
  expect(saved?.id).toMatch(/^account-/);
  expect(loginHarness).toHaveBeenCalledWith("codex", saved?.id);
  expect(selectedProviderAccountId("codex", "/repo")).toBe(work.id);
});

it("keeps a profile if removal is cancelled or native cleanup fails, then lets the user retry", async () => {
  vi.mocked(ask).mockResolvedValueOnce(false).mockResolvedValue(true);
  vi.mocked(invoke).mockRejectedValueOnce("Profile folder is busy").mockResolvedValue(undefined);
  expect(container.querySelector('button[title="Remove Default account"]')).toBeNull();

  await act(async () => getButton("Remove Work").click());
  expect(invoke).not.toHaveBeenCalled();
  await act(async () => getButton("Remove Work").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Profile folder is busy");
  expect(selectedProviderAccountId("codex", "/repo")).toBe(work.id);

  await act(async () => getButton("Remove Work").click());
  expect(invoke).toHaveBeenLastCalledWith("provider_account_remove", {
    provider: "codex",
    accountId: work.id,
  });
  expect(isProviderAccountRemoved("codex", work.id)).toBe(true);
  expect(selectedProviderAccountId("codex", "/repo")).toBe(DEFAULT_PROVIDER_ACCOUNT_ID);
  expect(container.querySelector('button[title="Remove Work"]')).toBeNull();
});
