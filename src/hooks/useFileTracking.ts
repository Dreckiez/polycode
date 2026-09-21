import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { dropOpenFiles } from "../lib/appTabs";
import {
  invalidateProjectFiles,
  rememberOpenedFile,
  resolveFileOpenRequest,
} from "../lib/fileIndex";
import {
  isFilesystemTab,
  newFileTab,
  openEditorTab,
  type WorkspaceTab,
} from "../lib/layout";
import { isEqualOrInside, rebasePath } from "../lib/paths";
import {
  type EditorNavigationTarget,
  type OpenFileFn,
} from "../lib/search";

export type FileTrackingDeps = {
  activeTabId: string;
  tabsRef: RefObject<WorkspaceTab[]>;
  gitCwdRef: RefObject<string>;
  sidebarCwdRef: RefObject<string>;
  editorNavigationToken: RefObject<number>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setDirtyFiles: Dispatch<SetStateAction<Set<string>>>;
  setEditorNavigation: Dispatch<
    SetStateAction<EditorNavigationTarget | null>
  >;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
};

export function useFileTracking(deps: FileTrackingDeps) {
  const d = deps;

  const onFileMoved = useCallback(
    (from: string, to: string) => {
      invalidateProjectFiles();
      d.setTabs((prev) =>
        prev.map((tab) => {
          return {
            ...tab,
            editorPanes: tab.editorPanes.map((pane) => ({
              ...pane,
              files: pane.files.map((file) =>
                isFilesystemTab(file)
                  ? { ...file, path: rebasePath(file.path, from, to) }
                  : file,
              ),
            })),
          };
        }),
      );
    },
    [],
  );

  const onFileDeleted = useCallback((path: string) => {
    invalidateProjectFiles();
    const dropped = new Set<string>();
    for (const tab of d.tabsRef.current) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (isFilesystemTab(file) && isEqualOrInside(file.path, path)) {
            dropped.add(file.id);
          }
        }
      }
    }
    d.setTabs((prev) =>
      prev.map((tab) =>
        dropOpenFiles(tab, (filePath) => isEqualOrInside(filePath, path)),
      ),
    );
    if (dropped.size === 0) return;
    d.setDirtyFiles((prev) => {
      const next = new Set(prev);
      for (const id of dropped) next.delete(id);
      return next;
    });
  }, []);

  const onOpenFile = useCallback<OpenFileFn>(
    (path, navigation, options) => {
      void (async () => {
        const resolved = await resolveFileOpenRequest(
          d.gitCwdRef.current,
          path,
          options,
        );
        rememberOpenedFile(d.sidebarCwdRef.current, resolved);
        const tab = d.tabsRef.current.find(
          (entry) => entry.id === d.activeTabId,
        );
        if (!tab) return;
        const file = newFileTab(resolved, d.sidebarCwdRef.current);
        d.setTabs((prev) =>
          prev.map((entry) =>
            entry.id === tab.id ? openEditorTab(entry, file) : entry,
          ),
        );
        if (navigation) {
          d.editorNavigationToken.current += 1;
          d.setEditorNavigation({
            path: resolved,
            ...navigation,
            token: d.editorNavigationToken.current,
          });
        }
        d.setComposerFocused(false);
      })();
    },
    [d.activeTabId],
  );

  const onFileDirtyChange = useCallback((fileId: string, dirty: boolean) => {
    d.setDirtyFiles((prev) => {
      if (prev.has(fileId) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }, []);

  return {
    onFileMoved,
    onFileDeleted,
    onOpenFile,
    onFileDirtyChange,
  };
}