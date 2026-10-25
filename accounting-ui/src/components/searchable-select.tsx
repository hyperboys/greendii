"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SearchableOption = { value: string; label: string };

export function SearchableSelect({
  label, value, selectedLabel, options, onChange, placeholder, searchPlaceholder,
  required = false, loading = false, error, onSearch,
}: {
  label: string; value: string; selectedLabel?: string; options: SearchableOption[];
  onChange: (value: string) => void; placeholder: string; searchPlaceholder: string;
  required?: boolean; loading?: boolean; error?: string; onSearch?: (query: string) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const selected = selectedLabel ?? options.find(option => option.value === value)?.label ?? "";
  const filtered = onSearch ? options : options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const available = loading || error ? filtered.filter(option => !option.value) : filtered;

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? `กรุณาเลือก${label}จากรายการ` : "");
  }, [value, required, label]);
  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function search(text: string) {
    setQuery(text);
    setActive(-1);
    onSearch?.(text);
  }
  function expand() {
    if (!open) { search(""); setOpen(true); }
  }
  function choose(option: SearchableOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    setActive(-1);
  }
  function close() { setOpen(false); setQuery(""); setActive(-1); }

  return (
    <div className="relative min-w-0" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <label htmlFor={id} className="block">{label}{required ? " *" : ""}</label>
      <div className="relative">
        <input
          ref={inputRef} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
          aria-required={required}
          aria-controls={`${id}-options`} aria-activedescendant={open && available[active] ? `${id}-option-${active}` : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          required={required && !value} autoComplete="off"
          className="w-full min-w-0 rounded-md border border-[#dfe5de] bg-white py-2 pl-3 pr-10"
          placeholder={open ? searchPlaceholder : placeholder}
          value={open ? query : selected}
          onFocus={expand} onClick={expand}
          onChange={event => { setOpen(true); search(event.target.value); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") { event.preventDefault(); close(); }
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) { expand(); return; }
              setActive(previous => {
                if (!available.length) return -1;
                if (previous < 0) return event.key === "ArrowDown" ? 0 : available.length - 1;
                return (previous + (event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
              });
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              const option = available[active >= 0 ? active : 0];
              if (option) choose(option);
            } else if (event.key === "Tab") close();
          }}
        />
        <ChevronDown size={17} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
      </div>
      {open && <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-[#dfe5de] bg-white shadow-lg">
        <div ref={listRef} id={`${id}-options`} role="listbox" aria-label={label} aria-busy={loading} className="max-h-60 overflow-y-auto overscroll-contain">
          {available.map((option, index) => <button
            id={`${id}-option-${index}`} key={option.value} type="button" role="option" tabIndex={-1}
            aria-selected={option.value === value}
            className={`block w-full break-words border-b border-gray-100 px-3 py-3 text-left text-sm last:border-0 hover:bg-blue-50 ${index === active || option.value === value ? "bg-blue-50 text-blue-800" : ""}`}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}
          >{option.label}</button>)}
        </div>
        {loading ? <p role="status" className="px-3 py-3 text-sm text-gray-500">กำลังค้นหา...</p>
          : !error && !available.some(option => option.value) && <p role="status" className="px-3 py-3 text-sm text-gray-500">ไม่พบรายการที่ตรงกับคำค้น</p>}
      </div>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
