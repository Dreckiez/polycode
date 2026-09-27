import { ChevronDown, Lock, LockOpen, Pencil, Sparkles } from "./icons";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  RUNTIME_MODE_HINT,
  RUNTIME_MODE_LABEL,
  RUNTIME_MODES,
  type HarnessId,
  type RuntimeMode,
} from "../lib/session";
import { Popover } from "./Popover";

type Props = {
  value: RuntimeMode;
  harness?: HarnessId;
  onChange: (mode: RuntimeMode) => void;
  onClose?: () => void;
  busy?: boolean;
};

const MENU_WIDTH = 296;

const ICONS: Record<RuntimeMode, typeof Lock> = {
  supervised: Lock,
  "auto-accept-edits": Pencil,
  auto: Sparkles,
  "full-access": LockOpen,
};

export function isRuntimeModeSupported(
  mode: RuntimeMode,
  harness?: HarnessId,
): boolean {
  if (mode === "auto") {
    return harness === "codex";
  }
  if (harness === "antigravity") {
    return mode === "full-access";
  }
  return true;
}

export function getRuntimeModeDisabledReason(
  mode: RuntimeMode,
  harness?: HarnessId,
): string | undefined {
  if (mode === "auto" && harness !== "codex") {
    return "Only available for Codex";
  }
  if (harness === "antigravity" && mode !== "full-access") {
    return "Antigravity CLI only supports Full Access";
  }
  return undefined;
}

export const AccessPicker = memo(function AccessPicker({
  value,
  harness,
  onChange,
  onClose,
  busy = false,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isRuntimeModeSupported(value, harness)) {
      const fallback: RuntimeMode =
        harness === "antigravity" ? "full-access" : "supervised";
      onChange(fallback);
    }
  }, [value, harness, onChange]);

  const [active, setActive] = useState(() => {
    const idx = RUNTIME_MODES.indexOf(value);
    if (idx >= 0 && isRuntimeModeSupported(value, harness)) {
      return idx;
    }
    const firstValid = RUNTIME_MODES.findIndex((m) =>
      isRuntimeModeSupported(m, harness),
    );
    return Math.max(0, firstValid);
  });

  const root = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const Icon = ICONS[value];

  const dismiss = (restore: boolean) => {
    setOpen(false);
    if (restore) onCloseRef.current?.();
  };

  useEffect(() => {
    if (!open) return;
    const idx = RUNTIME_MODES.indexOf(value);
    if (idx >= 0 && isRuntimeModeSupported(value, harness)) {
      setActive(idx);
    } else {
      const firstValid = RUNTIME_MODES.findIndex((m) =>
        isRuntimeModeSupported(m, harness),
      );
      setActive(Math.max(0, firstValid));
    }
  }, [open, value, harness]);

  const pick = (mode: RuntimeMode) => {
    if (!isRuntimeModeSupported(mode, harness)) return;
    onChange(mode);
    dismiss(true);
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      for (let i = active + 1; i < RUNTIME_MODES.length; i++) {
        if (isRuntimeModeSupported(RUNTIME_MODES[i], harness)) {
          setActive(i);
          return;
        }
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      for (let i = active - 1; i >= 0; i--) {
        if (isRuntimeModeSupported(RUNTIME_MODES[i], harness)) {
          setActive(i);
          return;
        }
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const mode = RUNTIME_MODES[active];
      if (mode && isRuntimeModeSupported(mode, harness)) {
        pick(mode);
      }
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        title={`${RUNTIME_MODE_HINT[value]}${busy ? " Changes apply to the next turn." : ""}`}
        aria-label={RUNTIME_MODE_LABEL[value]}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            dismiss(true);
            return;
          }
          setOpen(true);
        }}
        className={`flex h-7.5 max-w-56 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-content/70 hover:bg-content/10 hover:text-content ${
          open ? "bg-content/10 text-content" : ""
        }`}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 truncate text-[12px]">
          {RUNTIME_MODE_LABEL[value]}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/50 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="listbox"
          aria-label="Access"
          data-access-picker
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="p-1"
        >
          {RUNTIME_MODES.map((mode, index) => {
            const ModeIcon = ICONS[mode];
            const selected = mode === value;
            const highlighted = index === active;
            const disabled = !isRuntimeModeSupported(mode, harness);
            const disabledReason = getRuntimeModeDisabledReason(
              mode,
              harness,
            );

            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={disabled}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => !disabled && setActive(index)}
                onClick={() => !disabled && pick(mode)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                  disabled
                    ? "cursor-not-allowed opacity-40"
                    : highlighted || selected
                      ? "cursor-pointer bg-content/10 text-content"
                      : "cursor-pointer text-content hover:bg-content/5"
                }`}
              >
                <ModeIcon
                  className={`mt-0.5 size-3.5 shrink-0 ${
                    disabled ? "text-content/40" : "text-content/70"
                  }`}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="text-[13px] font-medium leading-5">
                      {RUNTIME_MODE_LABEL[mode]}
                    </span>
                    {disabledReason ? (
                      <span className="rounded bg-content/10 px-1.5 py-0.5 text-[10px] font-normal leading-none text-content/60">
                        {disabledReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-content/50">
                    {RUNTIME_MODE_HINT[mode]}
                  </span>
                </span>
              </button>
            );
          })}
        </Popover>
      ) : null}
    </div>
  );
});
