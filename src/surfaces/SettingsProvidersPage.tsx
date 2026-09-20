import { Loader, RefreshCw } from "../chrome/icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { HarnessIcon } from "../chrome/HarnessIcon";
import {
  getHarnessAvailabilitySnapshot,
  harnessUnavailableHint,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
} from "../lib/harness/availability";
import { refreshHarnessCatalogs } from "../lib/harness/registry";
import {
  defaultModelId,
  getModelSnapshot,
  hasLiveCatalog,
  isPickerProviderVisible,
  loadDefaultModels,
  loadLastModelChoice,
  modelsFor,
  resolveModel,
  saveDefaultModel,
  saveLastModelChoice,
  savePickerProviderVisible,
  subscribeModels,
} from "../lib/models";
import {
  HARNESSES,
  HARNESS_TITLE,
  type HarnessId,
} from "../lib/session";
import {
  Row,
  SecondaryButton,
  Select,
  Toggle,
} from "./SettingsControls";

export function ProvidersPage() {
  useSyncExternalStore(subscribeModels, getModelSnapshot, getModelSnapshot);
  useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const [choice, setChoice] = useState(loadLastModelChoice);
  const [defaultModels, setDefaultModels] = useState(loadDefaultModels);

  useEffect(() => {
    void probeHarnessAvailability();
  }, []);

  const onModelChange = (harness: HarnessId, model: string) => {
    saveDefaultModel(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    if (choice?.harness === harness) {
      saveLastModelChoice(harness, model);
      setChoice({ harness, model });
    }
  };

  const onDefault = (harness: HarnessId, model: string) => {
    saveLastModelChoice(harness, model);
    setDefaultModels((prev) => ({ ...prev, [harness]: model }));
    setChoice({ harness, model });
  };

  return (
    <>
      <p className="pb-3 text-[13px] leading-relaxed text-content/50">
        A provider is listed as installed once its CLI is found on your PATH.
        Uninstalled CLIs stay listed here but are omitted from the model picker.
        Turn off Show in picker to hide an installed provider from those tabs.
        The model beside each provider is what new conversations use when that
        provider is selected; Use by default picks the provider itself.
      </p>
      {HARNESSES.map((harness) => (
        <ProviderRow
          key={harness}
          harness={harness}
          selectedModel={
            defaultModels[harness] ??
            (choice?.harness === harness
              ? choice.model
              : defaultModelId(harness))
          }
          isDefault={choice?.harness === harness}
          onDefault={onDefault}
          onModelChange={onModelChange}
        />
      ))}
    </>
  );
}

function ProviderRow({
  harness,
  selectedModel,
  isDefault,
  onDefault,
  onModelChange,
}: {
  harness: HarnessId;
  selectedModel: string;
  isDefault: boolean;
  onDefault: (harness: HarnessId, model: string) => void;
  onModelChange: (harness: HarnessId, model: string) => void;
}) {
  const available = isHarnessAvailable(harness);
  const live = hasLiveCatalog(harness);
  const models = available && live ? modelsFor(harness) : [];
  const current =
    models.length > 0 ? resolveModel(harness, selectedModel) : null;
  const [inPicker, setInPicker] = useState(() =>
    isPickerProviderVisible(harness),
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!available || hasLiveCatalog(harness)) return;
    setRefreshing(true);
    void refreshHarnessCatalogs([harness]).finally(() => {
      setRefreshing(false);
    });
  }, [available, harness]);

  const onPickerVisible = (visible: boolean) => {
    savePickerProviderVisible(harness, visible);
    setInPicker(visible);
  };

  const onRetry = () => {
    setRefreshing(true);
    void refreshHarnessCatalogs([harness]).finally(() => {
      setRefreshing(false);
    });
  };

  let description: string;
  if (!available) {
    description = harnessUnavailableHint(harness);
  } else if (refreshing) {
    description = "Checking available models…";
  } else if (live && models.length > 0) {
    description = `${models.length} ${models.length === 1 ? "model" : "models"} available.`;
  } else {
    description =
      "CLI detected, but could not retrieve models. Make sure it is authenticated and try again.";
  }

  return (
    <Row
      label={
        <span className="flex items-center gap-2.5">
          <HarnessIcon harness={harness} className="size-4.5 shrink-0" />
          <span className="font-semibold text-content">{HARNESS_TITLE[harness]}</span>
          {isDefault ? (
            <span className="rounded-full bg-content/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-content/60">
              Default
            </span>
          ) : null}
        </span>
      }
      description={description}
    >
      {refreshing ? (
        <div className="flex items-center gap-2 text-[13px] text-content/45">
          <Loader className="size-4 animate-spin" aria-hidden />
          <span>Checking…</span>
        </div>
      ) : null}
      {available && !live && !refreshing ? (
        <SecondaryButton onClick={onRetry}>
          <RefreshCw className="size-3.5" strokeWidth={1.75} />
          Retry
        </SecondaryButton>
      ) : null}
      {current && live ? (
        <Select
          label={`${HARNESS_TITLE[harness]} model`}
          value={current.id}
          onChange={(next) => onModelChange(harness, next)}
          options={models.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
        />
      ) : null}
      {current && live ? (
        <SecondaryButton
          onClick={() => current && onDefault(harness, current.id)}
          disabled={isDefault}
        >
          {isDefault ? "Default" : "Use by default"}
        </SecondaryButton>
      ) : null}
      {available && live ? (
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-content/55">Show in picker</span>
          <Toggle
            label={`Show ${HARNESS_TITLE[harness]} in the model picker`}
            on={inPicker}
            onChange={onPickerVisible}
          />
        </div>
      ) : null}
    </Row>
  );
}