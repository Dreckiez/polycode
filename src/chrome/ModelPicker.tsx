import { Check, ChevronDown, Gauge } from "./icons";
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  coerceModelPickerTab,
  findModel,
  getModelSnapshot,
  getPickerVisibilitySnapshot,
  loadFavoriteModels,
  loadRecentModelChoices,
  modelsFor,
  resolveModel,
  saveFavoriteModels,
  showProviderInModelPicker,
  subscribeModels,
  subscribePickerVisibility,
  type AgentModel,
  type ModelPickerTab,
  type ModelSetting,
} from "../lib/models";
import {
  hasProbedHarnessAvailability,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
  getHarnessAvailabilitySnapshot,
} from "../lib/harness/availability";
import { refreshHarnessCatalogs } from "../lib/harness/registry";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { LAYER } from "../lib/layers";
import { HarnessIcon } from "./HarnessIcon";
import { Popover } from "./Popover";
import { ModelPickerPanel, RecentModelsMenu } from "./ModelPickerPanel";
import { MOD } from "../lib/platform";

type Props = {
  harness: HarnessId;
  model: string;
  values: Record<string, string>;
  hotkeys?: boolean;
  onChange: (harness: HarnessId, model: string) => void;
  onSettingsChange: (settings: Record<string, string>) => void;
  onClose?: () => void;
};

type RecentMenu = { models: AgentModel[] };

const POPUP_WIDTH = 390;
const POPUP_HEIGHT = 380;
const SETTING_MENU_WIDTH = 210;
const SELF = "[data-model-picker]";

const EFFORT_SETTING_IDS = new Set(["effort", "reasoning", "reasoningEffort"]);

function isEffortSetting(setting: ModelSetting): boolean {
  return EFFORT_SETTING_IDS.has(setting.id);
}

function effortSetting(model: AgentModel): ModelSetting | undefined {
  return model.settings?.find(
    (setting) => setting.kind === "select" && isEffortSetting(setting),
  );
}

function settingValue(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  const raw = values[setting.id];
  if (raw && setting.options.some((option) => option.value === raw)) {
    return raw;
  }
  return setting.value;
}

function settingValueLabel(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  const value = settingValue(setting, values);
  return (
    setting.options.find((option) => option.value === value)?.label ?? value
  );
}

function recentMenuModels(current: AgentModel): AgentModel[] {
  const models = loadRecentModelChoices().flatMap((choice) => {
    const item = findModel(choice.model);
    return item?.harness === choice.harness ? [item] : [];
  });
  if (!models.some((item) => item.id === current.id)) models.push(current);
  return models.slice(0, 6);
}

export const ModelPicker = memo(function ModelPicker({
  harness,
  model,
  values,
  hotkeys = false,
  onChange,
  onSettingsChange,
  onClose,
}: Props) {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const availabilityVersion = useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const visibilityVersion = useSyncExternalStore(
    subscribePickerVisibility,
    getPickerVisibilitySnapshot,
    getPickerVisibilitySnapshot,
  );
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ModelPickerTab>(harness);
  const [activeModel, setActiveModel] = useState(0);
  const [recentMenu, setRecentMenu] = useState<RecentMenu | null>(null);
  const [recentActive, setRecentActive] = useState(0);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(loadFavoriteModels);
  const recentMenuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const recentOpenRef = useRef(recentMenu != null);
  const currentRef = useRef<AgentModel | null>(null);
  const lastHotkey = useRef(0);
  onCloseRef.current = onClose;
  openRef.current = open;
  recentOpenRef.current = recentMenu != null;

  const current = resolveModel(harness, model);
  currentRef.current = current;
  const triggerTitle = `${HARNESS_TITLE[current.harness]} · ${current.name}`;

  const pickerHarnesses = useMemo(() => {
    void availabilityVersion;
    void visibilityVersion;
    return HARNESSES.filter((id) =>
      showProviderInModelPicker(
        id,
        isHarnessAvailable(id),
        hasProbedHarnessAvailability(),
      ),
    );
  }, [availabilityVersion, visibilityVersion]);
  const providerKey = pickerHarnesses.join(",");
  const visibleTab = coerceModelPickerTab(tab, (id) =>
    pickerHarnesses.includes(id),
  );

  const visibleModels = useMemo(() => {
    void catalogVersion;
    const needle = query.trim().toLowerCase();
    const pool =
      visibleTab === "favorites"
        ? favorites
            .map((id) => findModel(id))
            .filter(
              (item): item is AgentModel =>
                item != null && pickerHarnesses.includes(item.harness),
            )
        : modelsFor(visibleTab);
    if (!needle) return pool;
    return pool.filter((item) =>
      `${item.name} ${HARNESS_TITLE[item.harness]}`
        .toLowerCase()
        .includes(needle),
    );
  }, [catalogVersion, favorites, providerKey, query, visibleTab]);

  const dismiss = (restore: boolean) => {
    setOpen(false);
    setRecentMenu(null);
    if (restore) onCloseRef.current?.();
  };

  const togglePicker = () => {
    if (openRef.current) dismiss(true);
    else {
      setRecentMenu(null);
      setOpen(true);
    }
  };

  const openRecentMenu = () => {
    const selected = currentRef.current;
    if (!selected) return;
    const models = recentMenuModels(selected);
    const selectedIndex = models.findIndex((item) => item.id === selected.id);
    setOpen(false);
    setRecentActive(selectedIndex >= 0 ? selectedIndex : 0);
    setRecentMenu({ models });
  };

  const toggleRecentMenu = () => {
    if (recentOpenRef.current) {
      setRecentMenu(null);
      onCloseRef.current?.();
    } else {
      openRecentMenu();
    }
  };

  const toggleFromHotkey = () => {
    const now = performance.now();
    if (now - lastHotkey.current < 80) return;
    lastHotkey.current = now;
    toggleRecentMenu();
  };

  useEffect(() => {
    if (!open) return;
    void probeHarnessAvailability();
    void refreshHarnessCatalogs([current.harness]);
    setTab(
      coerceModelPickerTab(current.harness, (id) =>
        pickerHarnesses.includes(id),
      ),
    );
    setQuery("");
    setFavorites(loadFavoriteModels());
  }, [open, current.harness]);

  useEffect(() => {
    if (visibleTab === tab) return;
    setTab(visibleTab);
  }, [tab, visibleTab]);

  useEffect(() => {
    if (!open || visibleTab === "favorites") return;
    void refreshHarnessCatalogs([visibleTab]);
  }, [open, visibleTab]);

  useEffect(() => {
    if (!open) return;
    const index = visibleModels.findIndex((item) => item.id === current.id);
    setActiveModel(index >= 0 ? index : 0);
  }, [open, visibleTab, query, current.id]);

  useEffect(() => {
    const inBlockingUi = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest(".monocode-terminal")) return true;
      return Boolean(
        target.closest(
          "[data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-access-picker], [data-effort-picker]",
        ),
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (
        hotkeys &&
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "." || event.code === "Period")
      ) {
        if (!openRef.current && inBlockingUi(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFromHotkey();
        return;
      }
      if (!openRef.current || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    };

    const onMenu = () => {
      if (!hotkeys) return;
      if (inBlockingUi(document.activeElement)) return;
      toggleFromHotkey();
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("open_model_picker", onMenu);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("open_model_picker", onMenu);
    };
  }, [hotkeys]);

  const pickModel = (item: AgentModel) => {
    if (!isHarnessAvailable(item.harness)) return;
    const effort = effortSetting(item);
    if (effort) {
      const currentVal = values[effort.id];
      if (currentVal && !effort.options.some((opt) => opt.value === currentVal)) {
        onSettingsChange({ ...values, [effort.id]: effort.value });
      }
    }
    onChange(item.harness, item.id);
    dismiss(true);
  };

  useEffect(() => {
    if (!recentMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setRecentActive(
          (index) =>
            (index + direction + recentMenu.models.length) %
            recentMenu.models.length,
        );
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const item = recentMenu.models[recentActive];
      if (item) pickModel(item);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recentActive, recentMenu]);

  const toggleFavorite = (id: string) => {
    setFavorites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      saveFavoriteModels(next);
      return next;
    });
  };

  const selectTab = (next: ModelPickerTab) => {
    setTab(next);
    setQuery("");
    setActiveModel(0);
  };

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveModel((index) => Math.min(visibleModels.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveModel((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visibleModels[activeModel];
      if (item) pickModel(item);
      return;
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        title={`${triggerTitle} · Recent models: right-click or ${MOD}.`}
        aria-label={`${HARNESS_TITLE[current.harness]} ${current.name}`}
        aria-keyshortcuts={`${MOD}.`}
        aria-expanded={open || recentMenu != null}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openRecentMenu();
        }}
        onClick={() => togglePicker()}
        className={`group flex h-7.5 max-w-64 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12.5px] font-medium transition-all duration-150 ${
          open
            ? "bg-content/10 text-content"
            : "text-content/85 hover:bg-content/10 hover:text-content"
        }`}
      >
        <HarnessIcon
          harness={current.harness}
          className="size-4 shrink-0 transition-transform group-hover:scale-105"
        />
        <span className="min-w-0 truncate">{current.name}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/50 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <Popover
          anchor={button}
          side="top"
          width={POPUP_WIDTH}
          minHeight={POPUP_HEIGHT}
          maxHeight={POPUP_HEIGHT}
          layer={LAYER.submenu}
          autoFocus
          dismissOnEscape={false}
          ignore={SELF}
          onDismiss={() => dismiss(false)}
          role="dialog"
          aria-label="Models"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          data-model-picker
          style={{
            height: POPUP_HEIGHT,
            minHeight: POPUP_HEIGHT,
            maxHeight: POPUP_HEIGHT,
          }}
          className="flex min-h-0 overflow-hidden rounded-xl border border-content/10 bg-background-base font-sans shadow-2xl backdrop-blur-md"
        >
          <ModelPickerPanel
            visibleTab={visibleTab}
            pickerHarnesses={pickerHarnesses}
            models={visibleModels}
            current={current}
            activeModel={activeModel}
            favorites={favorites}
            query={query}
            onQueryChange={onQueryChange}
            onQueryClear={() => setQuery("")}
            onPick={pickModel}
            onToggleFavorite={toggleFavorite}
            onSelect={selectTab}
            onActiveChange={setActiveModel}
          />
        </Popover>
      ) : null}

      {recentMenu ? (
        <RecentModelsMenu
          anchor={button}
          models={recentMenu.models}
          current={current}
          active={recentActive}
          menuId={recentMenuId}
          onDismiss={() => setRecentMenu(null)}
          onActiveChange={setRecentActive}
          onPick={pickModel}
        />
      ) : null}
    </>
  );

  function onQueryChange(val: string) {
    setQuery(val);
    setActiveModel(0);
  }
});

export const EffortPicker = memo(function EffortPicker({
  harness,
  model,
  values,
  onSettingsChange,
  onClose,
}: Pick<
  Props,
  "harness" | "model" | "values" | "onSettingsChange" | "onClose"
>) {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = resolveModel(harness, model);
  void catalogVersion;
  const setting = effortSetting(current);

  if (!setting) return null;

  const value = settingValue(setting, values);
  const valueLabel = settingValueLabel(setting, values);
  const dismiss = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) onClose?.();
  };
  const openPicker = () => {
    const selectedIndex = setting.options.findIndex(
      (option) => option.value === value,
    );
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const pick = (optionValue: string) => {
    onSettingsChange({ ...values, [setting.id]: optionValue });
    dismiss(true);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        title={`Effort: ${valueLabel}`}
        aria-label={`Effort: ${valueLabel}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? dismiss(true) : openPicker())}
        className={`flex h-7.5 max-w-48 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12.5px] font-normal transition-all duration-150 ${
          open
            ? "bg-content/10 text-content"
            : "text-content/75 hover:bg-content/10 hover:text-content"
        }`}
      >
        <Gauge className="size-4 shrink-0 text-content/50" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{valueLabel}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-content/40 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <Popover
          anchor={button}
          side="top"
          width={SETTING_MENU_WIDTH}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="menu"
          aria-label="Effort"
          aria-activedescendant={`${menuId}-${active}`}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActive(
                (index) =>
                  (index + direction + setting.options.length) %
                  setting.options.length,
              );
              return;
            }
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            const option = setting.options[active];
            if (option) pick(option.value);
          }}
          data-effort-picker
          className="p-1 font-sans"
        >
          {setting.options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === active;
            return (
              <button
                key={option.value}
                id={`${menuId}-${index}`}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option.value)}
                className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] text-content ${
                  highlighted ? "bg-content/10" : "hover:bg-content/5"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? (
                  <Check
                    className="size-3.5 shrink-0 text-accent"
                    strokeWidth={2}
                  />
                ) : null}
              </button>
            );
          })}
        </Popover>
      ) : null}
    </>
  );
});
