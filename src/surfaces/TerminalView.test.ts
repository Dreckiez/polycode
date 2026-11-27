// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, ITerminalOptions } from "@xterm/xterm";
import { openUrl } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

const pty = vi.hoisted(() => ({
  spawnPty: vi.fn(async () => {}),
  resizePty: vi.fn(async () => {}),
  writePty: vi.fn(async () => {}),
  subscribePty: vi.fn(() => () => {}),
  getPtyStatus: vi.fn(async () => ({ foreground: null })),
}));
vi.mock("../lib/pty", () => pty);
const xterm = vi.hoisted(() => ({
  options: [] as ITerminalOptions[],
  loadAddon: vi.fn(),
}));
vi.mock("../lib/terminalLayout", () => ({
  fitTerminal: () => null,
  applyTerminalChrome: () => {},
  resetGridStretch: () => {},
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    constructor(options: ITerminalOptions) {
      xterm.options.push(options);
    }
    cols = 80;
    rows = 24;
    options = {};
    parser = { registerOscHandler: () => ({ dispose() {} }) };
    buffer = {
      active: { type: "normal" },
      onBufferChange: () => ({ dispose() {} }),
    };
    open() {}
    /** Accept addon registration without activating addons in the terminal mock. */
    loadAddon = xterm.loadAddon;
    focus() {}
    dispose() {}
    writeln() {}
    onData() {
      return { dispose() {} };
    }
    onRender() {
      return { dispose() {} };
    }
    attachCustomKeyEventHandler() {}
    attachCustomWheelEventHandler() {}
  },
}));
import { cssColor, TerminalView } from "./TerminalView";

afterEach(() => {
  xterm.options.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
}

it("detects plain HTTP(S) URLs and opens them through the addon callback", async () => {
  const { host, root } = setup();
  const { Terminal } =
    await vi.importActual<typeof import("@xterm/xterm")>("@xterm/xterm");
  const terminal = new Terminal({ cols: 200, rows: 1 });
  const registerLinkProvider = vi.spyOn(terminal, "registerLinkProvider");
  let addon: WebLinksAddon | undefined;
  try {
    await act(async () => {
      root.render(
        createElement(TerminalView, {
          id: "plain-links",
          cwd: "/tmp",
          active: true,
        }),
      );
    });
    addon = xterm.loadAddon.mock.calls
      .map(([loaded]) => loaded)
      .find(
        (loaded): loaded is WebLinksAddon => loaded instanceof WebLinksAddon,
      );
    expect(addon).toBeDefined();
    addon!.activate(terminal);
    const urls = [
      "http://example.com",
      "https://example.com/path",
      "HTTPS://example.com",
    ];
    const blocked = [
      "file:///tmp/test",
      "javascript:alert(1)",
      "mailto:test@example.com",
      "ftp://example.com",
    ];
    await new Promise<void>((resolve) => {
      terminal.write([...urls, ...blocked].join(" "), resolve);
    });
    const provider = registerLinkProvider.mock.calls[0][0];
    const links = await new Promise<ILink[] | undefined>((resolve) => {
      provider.provideLinks(1, resolve);
    });
    expect(links?.map((link) => link.text)).toEqual(urls);
    for (const link of links!) {
      link.activate(new MouseEvent("click"), link.text);
    }
    expect(vi.mocked(openUrl).mock.calls).toEqual(urls.map((url) => [url]));
    vi.mocked(openUrl).mockClear();
    // Exercise the callback's guard even if a provider dispatches another scheme.
    for (const uri of blocked) {
      links![0].activate(new MouseEvent("click"), uri);
    }
    expect(openUrl).not.toHaveBeenCalled();
  } finally {
    addon?.dispose();
    terminal.dispose();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
});

it("opens only HTTP(S) URLs dispatched by the OSC 8 link handler", async () => {
  const { host, root } = setup();
  try {
    await act(async () => {
      root.render(
        createElement(TerminalView, {
          id: "osc-links",
          cwd: "/tmp",
          active: true,
        }),
      );
    });
    const handler = xterm.options[0].linkHandler!;
    const urls = [
      "http://example.com",
      "https://example.com/path",
      "HTTPS://example.com",
    ];
    for (const uri of urls) {
      handler.activate(new MouseEvent("click"), uri, undefined);
    }
    expect(vi.mocked(openUrl).mock.calls).toEqual(urls.map((url) => [url]));
    vi.mocked(openUrl).mockClear();
    for (const uri of [
      "file:///tmp/test",
      "javascript:alert(1)",
      "mailto:test@example.com",
      "ftp://example.com",
    ]) {
      handler.activate(new MouseEvent("click"), uri, undefined);
    }
    expect(openUrl).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
});

describe("cssColor", () => {
  it("resolves valid CSS colors", () => {
    const red = cssColor("red", "#000000");
    expect(red).toBeDefined();
    expect(red).not.toBe("#000000");
  });

  it("returns fallback for invalid colors without leaking previous context color", () => {
    // 1. Establish a previous color in the singleton context
    const valid = cssColor("#00ff00", "#000000");
    expect(valid).toBe("#00ff00");

    // 2. Call with an invalid color; must return the fallback rather than #00ff00
    const fallback = cssColor("not-a-real-color-12345", "#ff00ff");
    expect(fallback).toBe("#ff00ff");
  });

  it("supports var fallback syntax when variable is unset", () => {
    const result = cssColor("var(--non-existent-variable, #abcdef)", "#000000");
    expect(result).toBe("#abcdef");
  });

  it("does not leak previous color when given keywords unparseable by canvas like currentColor", () => {
    const valid = cssColor("#00ff00", "#000000");
    expect(valid).toBe("#00ff00");

    const result = cssColor("currentColor", "#ff00ff");
    expect(result).not.toBe("#00ff00");
  });
});
