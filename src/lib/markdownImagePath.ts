import { joinPath } from "./paths";

/** Resolve a local Markdown image URL against the directory containing its file. */
export function resolveMarkdownImagePath(
  url: string,
  cwd?: string,
): string | null {
  let path = url.trim();
  if (!path) return null;

  if (path.startsWith("file://")) {
    path = path.slice("file://".length);
    if (path.startsWith("localhost/")) path = path.slice("localhost".length);
    else if (!path.startsWith("/")) return null;
  }

  // Fragments and query strings address the browser resource rather than the
  // filesystem path. Split before decoding so encoded # and ? remain valid.
  path = path.split(/[?#]/, 1)[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    // A literal percent sign is valid in a filename.
  }

  if (path.startsWith("/") && /^\/[a-zA-Z]:/.test(path)) path = path.slice(1);
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/")) return path;
  if (!cwd) return null;
  return joinPath(cwd, path);
}
