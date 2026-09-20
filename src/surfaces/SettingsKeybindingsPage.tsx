import { useMemo, useState } from "react";
import { Search } from "../chrome/icons";
import { filterKeybindings, KEYBINDINGS } from "../lib/settings";

export function KeybindingsPage() {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterKeybindings(KEYBINDINGS, query), [query]);

  return (
    <>
      <div className="flex items-center justify-end gap-3 pb-3.5">
        <span className="shrink-0 text-[13px] text-content/45 tabular-nums">
          {rows.length} {rows.length === 1 ? "binding" : "bindings"}
        </span>
        <label className="flex h-8 w-60 shrink-0 items-center gap-2 rounded-lg border border-content/10 bg-content/3 px-2.5 text-content/45 focus-within:border-content/20">
          <Search className="size-4 shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter shortcuts…"
            aria-label="Filter keybindings"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none placeholder:text-content/35"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-content/10">
        <div className="flex items-center border-b border-content/10 bg-content/5 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-content/45">
          <span className="min-w-0 flex-1">Command</span>
          <span className="w-44 shrink-0">Keybinding</span>
          <span className="w-32 shrink-0">When</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-content/45">
            No matching bindings
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.command}-${row.keys}`}
              className="flex items-center border-b border-content/5 px-4 py-2.5 text-[13px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-content">
                {row.command}
              </span>
              <span className="w-44 shrink-0 font-mono text-[13px] text-content/85">
                {row.keys}
              </span>
              <span className="w-32 shrink-0 font-mono text-[12px] text-content/45">
                {row.when}
              </span>
            </div>
          ))
        )}
      </div>

      <p className="pt-3 text-[13px] text-content/45">
        Bindings come from the app menu and the workspace key handler; they
        aren’t customizable yet.
      </p>
    </>
  );
}