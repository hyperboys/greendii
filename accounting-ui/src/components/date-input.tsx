"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { formatAccountingDate, parseAccountingDate } from "@/lib/accounting-date";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange?: (value: string) => void;
};

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pad = (value: number) => String(value).padStart(2, "0");

function monthForValue(value: string) {
  const iso = value ? parseAccountingDate(formatAccountingDate(value)) : null;
  const date = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function DateInput({ value, onChange, className, disabled, readOnly, onFocus, onClick, onKeyDown, ...props }: DateInputProps) {
  const [text, setText] = useState(value ? formatAccountingDate(value) : "");
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => monthForValue(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const calendarId = useId();
  const editable = !disabled && !readOnly;
  useEffect(() => {
    setText(value ? formatAccountingDate(value) : "");
    setViewDate(monthForValue(value));
    inputRef.current?.setCustomValidity("");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function showCalendar() {
    if (!editable || inputRef.current?.matches(":disabled")) return;
    setViewDate(monthForValue(value));
    setOpen(true);
  }

  function choose(iso: string) {
    if (!editable || inputRef.current?.matches(":disabled")) return;
    setText(iso ? formatAccountingDate(iso) : "");
    inputRef.current?.setCustomValidity("");
    onChange?.(iso);
    inputRef.current?.focus();
    setOpen(false);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const offset = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const selectedIso = value ? parseAccountingDate(formatAccountingDate(value)) : null;

  return (
    <span ref={wrapperRef} className="relative block min-w-0" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input
        {...props}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={className}
        style={{ ...props.style, paddingRight: "2.75rem" }}
        disabled={disabled}
        readOnly={readOnly}
        role="combobox"
        aria-autocomplete="none"
        placeholder="dd/mm/yyyy"
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        maxLength={10}
        value={text}
        aria-haspopup="dialog"
        aria-expanded={open && editable}
        aria-controls={open && editable ? calendarId : undefined}
        onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) showCalendar(); }}
        onClick={event => { onClick?.(event); if (!event.defaultPrevented) showCalendar(); }}
        onKeyDown={event => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          if (event.key === "ArrowDown") { event.preventDefault(); showCalendar(); }
          if (event.key === "Enter" && open) { event.preventDefault(); setOpen(false); }
        }}
        onChange={event => {
          const next = event.target.value;
          setText(next);
          const parsed = parseAccountingDate(next);
          event.target.setCustomValidity(next && !parsed ? "กรุณากรอกวันที่จริงในรูปแบบ dd/mm/yyyy" : "");
          if (!next || parsed) {
            if (parsed) setViewDate(monthForValue(parsed));
            onChange?.(parsed || "");
          }
        }}
      />
      <button type="button" disabled={!editable} aria-label="เปิดปฏิทิน"
        aria-haspopup="dialog" aria-expanded={open && editable} aria-controls={open && editable ? calendarId : undefined}
        className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-md text-gray-500 hover:text-blue-700 disabled:opacity-50"
        onClick={() => { if (open) setOpen(false); else showCalendar(); }}>
        <Calendar size={18} aria-hidden="true" />
      </button>
      {open && editable && <span id={calendarId} role="dialog" aria-label="เลือกวันที่"
        className="absolute left-0 top-full z-50 mt-1 block w-64 max-w-full rounded-lg border border-[#dfe5de] bg-white p-3 shadow-lg">
        <span className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="เดือนก่อนหน้า" className="rounded p-1 hover:bg-gray-100"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span aria-live="polite" className="text-sm font-semibold">{MONTHS[month]} {year}</span>
          <button type="button" aria-label="เดือนถัดไป" className="rounded p-1 hover:bg-gray-100"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
        </span>
        <span className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-500">
          {WEEKDAYS.map(day => <span key={day} className="py-1">{day}</span>)}
        </span>
        <span className="grid grid-cols-7 gap-0.5 text-center text-sm">
          {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
            return <button key={iso} type="button" aria-label={formatAccountingDate(iso)}
              aria-pressed={iso === selectedIso} aria-current={iso === todayIso ? "date" : undefined}
              className={`h-8 rounded-md ${iso === selectedIso ? "bg-blue-600 font-semibold text-white" : iso === todayIso ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-gray-100"}`}
              onClick={() => choose(iso)}>{day}</button>;
          })}
        </span>
        <span className="mt-2 flex items-center justify-between text-sm">
          <button type="button" className="text-gray-600 hover:underline" onClick={() => choose("")}>ล้าง</button>
          <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => choose(todayIso)}>วันนี้</button>
        </span>
      </span>}
    </span>
  );
}
