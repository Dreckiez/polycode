import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import { activateWindowAppearance, initAppearance } from "./lib/appearance";
import { initSounds } from "./lib/sounds";
import { handleQuitRequested, loadBootWorkspace } from "./lib/appLifecycle";
import { consumeInstalledUpdate } from "./lib/updateNotice";
import { ErrorBoundary } from "./chrome/ErrorBoundary";
import "./index.css";

initAppearance();
initSounds();

// Global diagnostic capture for uncaught errors and promise rejections
window.addEventListener("error", (event) => {
  console.error("[Uncaught window error]:", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled promise rejection]:", event.reason);
});

function dismissBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash || splash.dataset.dismissed === "1") return;
  splash.dataset.dismissed = "1";
  const fade = () => {
    activateWindowAppearance();
    splash.classList.add("boot-splash-out");
    window.setTimeout(() => splash.remove(), 180);
  };
  // useLayoutEffect runs before paint. Two frames later the app is on
  // screen, so the fade reveals UI instead of the desktop blur.
  requestAnimationFrame(() => {
    requestAnimationFrame(fade);
  });
}

function BootGate({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    dismissBootSplash();
  }, []);
  return children;
}

void listen("quit_requested", () => {
  void handleQuitRequested();
});

void loadBootWorkspace()
  .then(({ windowTransfer, resumed, history, historyCwd }) => {
    const installedUpdate = windowTransfer ? null : consumeInstalledUpdate();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootGate>
          <ErrorBoundary
            title="Polycode encountered an unexpected error"
            description="The workspace view crashed unexpectedly. You can try reloading or check the developer logs."
            onReset={() => window.location.reload()}
          >
            <App
              windowTransfer={windowTransfer}
              resumed={resumed}
              installedUpdate={installedUpdate}
              history={history}
              historyCwd={historyCwd}
            />
          </ErrorBoundary>
        </BootGate>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    dismissBootSplash();
    console.error("[Failed to boot workspace]:", error);
    const message = error instanceof Error ? error.message : String(error);
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 p-6 text-neutral-100 select-text">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-white/10 bg-neutral-900/80 p-6 text-center shadow-2xl">
            <div className="text-base font-semibold text-rose-400">
              Failed to start Polycode
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              An error occurred while loading your saved workspace data:
            </p>
            <pre className="max-h-36 w-full overflow-auto rounded bg-black/50 p-2 font-mono text-[11px] text-rose-300">
              {message}
            </pre>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-neutral-100 px-3.5 py-1.5 text-xs font-medium text-neutral-900 shadow hover:bg-white cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  } catch {
                    window.location.reload();
                  }
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10 cursor-pointer"
              >
                Reset cache & restart
              </button>
            </div>
          </div>
        </div>
      </React.StrictMode>,
    );
  });
