import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type InstalledUpdate } from "../lib/updateNotice";

export type DismissUpdateDeps = {
  setUpdateNotice: Dispatch<SetStateAction<InstalledUpdate | null>>;
};

export function useDismissUpdate(deps: DismissUpdateDeps) {
  const d = deps;

  const onDismissUpdate = useCallback(() => d.setUpdateNotice(null), [
    d.setUpdateNotice,
  ]);

  return { onDismissUpdate };
}