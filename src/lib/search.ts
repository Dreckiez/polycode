import { pathKey, slash } from "./paths";

export type EditorNavigation = {
  line: number;
  column?: number;
};

export type EditorNavigationTarget = EditorNavigation & {
  path: string;
  token: number;
};

export type FileOpenOptions = {
  /** The caller obtained this concrete path from the filesystem or file index. */
  exact?: boolean;
};

export type OpenFileFn = (
  path: string,
  navigation?: EditorNavigation,
  options?: FileOpenOptions,
) => void;

export function normalizeEditorPath(path: string): string {
  return slash(path).replace(/\/+$/, "") || path;
}

export function editorPathsEqual(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}
