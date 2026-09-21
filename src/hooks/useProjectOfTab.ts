import { useCallback, type RefObject } from "react";

export type ProjectOfTabDeps = {
  tabProjectsRef: RefObject<Map<string, string>>;
};

export function useProjectOfTab(
  deps: ProjectOfTabDeps,
): { projectOfTab: (id: string) => string | undefined } {
  const d = deps;

  const projectOfTab = useCallback(
    (id: string) => d.tabProjectsRef.current.get(id),
    [d.tabProjectsRef],
  );

  return { projectOfTab };
}