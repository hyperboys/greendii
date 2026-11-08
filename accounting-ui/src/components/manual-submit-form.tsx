"use client";

import type { ComponentProps } from "react";

const implicitSubmitInputTypes = new Set([
  "text", "search", "url", "tel", "email", "password",
  "date", "month", "week", "time", "datetime-local", "number",
]);

export function ManualSubmitForm({ onKeyDown, ...props }: ComponentProps<"form">) {
  return <form {...props} onKeyDown={event => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLTextAreaElement || target.isContentEditable) return;
    if (target instanceof HTMLButtonElement && target.type !== "submit") return;
    if (target instanceof HTMLInputElement && !implicitSubmitInputTypes.has(target.type) &&
      target.type !== "submit" && target.type !== "image") return;
    if (!(target instanceof HTMLButtonElement || target instanceof HTMLInputElement)) return;

    event.preventDefault();
  }} />;
}
