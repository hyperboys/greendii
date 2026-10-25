"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { formatAccountingDate, parseAccountingDate } from "@/lib/accounting-date";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange?: (value: string) => void;
};

export function DateInput({ value, onChange, ...props }: DateInputProps) {
  const [text, setText] = useState(value ? formatAccountingDate(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(value ? formatAccountingDate(value) : "");
    inputRef.current?.setCustomValidity("");
  }, [value]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      placeholder="dd/mm/yyyy"
      pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
      maxLength={10}
      value={text}
      onChange={event => {
        const next = event.target.value;
        setText(next);
        const parsed = parseAccountingDate(next);
        event.target.setCustomValidity(next && !parsed ? "กรุณากรอกวันที่จริงในรูปแบบ dd/mm/yyyy" : "");
        if (!next || parsed) onChange?.(parsed || "");
      }}
    />
  );
}
