"use client";
// Type a category or pick one. Existing names win over near-duplicates ("travel" becomes "Travel"); a new name is offered
// as "New category". Saves on Enter, on picking, or on leaving the field; Escape restores.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { canonicalCategory, sameCategory, tidyCategory } from "../../lib/categories";

export function CategoryInput({ value, categories, counts, onSave, label, placeholder = "No category", className = "", inputProps = {}, onNav }: {
  value: string; categories: string[]; counts?: Map<string, number>; onSave: (v: string) => Promise<boolean> | boolean | void;
  label: string; placeholder?: string; className?: string; inputProps?: Record<string, unknown>;
  /** Spreadsheet-style movement out of the field (Enter/↑/↓ while the list is closed). */
  onNav?: (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => void;
}) {
  const [text, setText] = useState(value), [open, setOpen] = useState(false), [active, setActive] = useState(0), [bad, setBad] = useState(false);
  const focused = useRef(false), list = useId();
  // The latest text and the last value sent, read by blur handlers that may belong to an earlier render.
  const live = useRef(value), sent = useRef(value);
  const put = (v: string) => { live.current = v; setText(v); };
  useEffect(() => { sent.current = value; if (!focused.current) put(value); }, [value]);
  const typed = tidyCategory(text);
  const matches = categories.filter(c => !typed || c.toLowerCase().includes(typed.toLowerCase()));
  const exact = categories.find(c => sameCategory(c, typed));
  const options: { value: string; label: string; hint?: string }[] = [
    ...matches.map(c => ({ value: c, label: c, hint: counts ? `${counts.get(c) ?? 0}` : undefined })),
    ...(typed && !exact ? [{ value: typed, label: `New category “${typed}”` }] : []),
    ...(value && !typed ? [{ value: "", label: "No category" }] : []),
  ];
  const commit = async (raw: string) => {
    const next = canonicalCategory(raw, categories);
    put(next); setOpen(false);
    if (next === sent.current) { setBad(false); return; }
    sent.current = next;
    const ok = await onSave(next);
    if (ok === false && sent.current === next) sent.current = value;
    setBad(ok === false);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { if (open) { setOpen(false); e.preventDefault(); return; } put(value); (e.target as HTMLInputElement).blur(); return; }
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey) {
      e.preventDefault(); setActive(a => Math.max(0, Math.min(options.length - 1, a + (e.key === "ArrowDown" ? 1 : -1)))); return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[active]) { void commit(options[active].value); onNav?.("Enter", e.shiftKey); return; }
      void commit(live.current); onNav?.("Enter", e.shiftKey); return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey && onNav) { e.preventDefault(); void commit(live.current); onNav(e.key, false); return; }
    if (e.key === "ArrowDown" && !open) { setOpen(true); setActive(0); }
  };
  return (
    <span className={`cat-input${open && options.length ? " open" : ""}${bad ? " bad" : ""} ${className}`}>
      <input {...inputProps} role="combobox" aria-expanded={open && options.length > 0} aria-controls={list} aria-autocomplete="list" aria-label={label}
        aria-activedescendant={open && options[active] ? `${list}-${active}` : undefined} aria-invalid={bad || undefined}
        value={text} placeholder={placeholder} maxLength={100} spellCheck={false}
        onFocus={() => { focused.current = true; setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={e => { put(e.target.value); setOpen(true); setActive(0); setBad(false); }}
        onKeyDown={keys}
        onBlur={() => { focused.current = false; setOpen(false); if (canonicalCategory(live.current, categories) !== sent.current) void commit(live.current); }} />
      {open && options.length > 0 && (
        <ul id={list} role="listbox" className="cat-list" onMouseDown={e => e.preventDefault()}>
          {options.map((o, n) => (
            <li key={`${o.value}:${n}`} id={`${list}-${n}`} role="option" aria-selected={n === active} className={`${n === active ? "on" : ""}${o.label.startsWith("New") ? " new" : ""}`}
              onMouseEnter={() => setActive(n)} onClick={() => void commit(o.value)}>
              <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
      {bad && <span className="cell-err" role="alert">Not saved. Try again.</span>}
    </span>
  );
}
