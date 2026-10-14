import { resolveWorkspaceFileReference } from "./paths";
import { MARKDOWN_LOCAL_ORIGIN } from "./markdownImagePath";

type MarkdownNode = {
  type: string;
  url?: string;
  children?: MarkdownNode[];
};

/** Normalize local file links before URL sanitizing; keep all other URLs intact. */
export function remarkWorkspaceFileLinks({ cwd }: { cwd?: string }) {
  function visit(node: MarkdownNode) {
    if ((node.type === "link" || node.type === "definition") && node.url) {
      const file = resolveWorkspaceFileReference(node.url, cwd);
      if (file) {
        const path = file.path.startsWith("/") ? file.path : `/${file.path}`;
        let href = path.split("/").map(encodeURIComponent).join("/");
        // Preserve a UNC path as a path, not a protocol-relative web origin.
        if (href.startsWith("//")) href = `/%2F${href.slice(2)}`;
        const target = file.navigation;
        node.url =
          href +
          (target
            ? `:${target.line}${target.column ? `:${target.column}` : ""}`
            : "");
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  return visit;
}

/**
 * Keep local image paths through rehype-harden. Bare Markdown paths such as
 * `report_images/Truoc_Du.png` are otherwise treated as invalid URLs before
 * the image renderer can resolve them against the current document.
 */
export function remarkWorkspaceImagePaths() {
  function visit(node: MarkdownNode) {
    if (node.type === "image" && node.url && isLocalImageUrl(node.url)) {
      node.url = `${MARKDOWN_LOCAL_ORIGIN}/${node.url.replace(/^\.\//, "")}`;
    }
    for (const child of node.children ?? []) visit(child);
  }
  return visit;
}

function isLocalImageUrl(url: string): boolean {
  const value = url.trim();
  return !!value &&
    !value.startsWith("/") &&
    !value.startsWith("#") &&
    !value.startsWith("//") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value);
}
