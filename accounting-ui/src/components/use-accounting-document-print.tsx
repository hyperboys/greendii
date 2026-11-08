"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function useAccountingDocumentPrint(record?: { id: string; updatedAt: string } | null) {
  const [content, setContent] = useState<ReactNode>(null);
  const [printing, setPrinting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const generation = useRef(0);
  const onReady = useCallback((value: boolean) => setReady(value), []);
  const reset = useCallback(() => {
    generation.current += 1;
    active.current = false;
    setContent(null);
    setReady(false);
    setPrinting(false);
  }, []);
  useEffect(() => { reset(); }, [record?.id, record?.updatedAt, reset]);

  const requestPrint = useCallback(async (prepare: (onReady: (value: boolean) => void) => Promise<ReactNode>) => {
    if (active.current) return;
    active.current = true;
    const request = ++generation.current;
    setError("");
    setReady(false);
    setPrinting(true);
    try {
      const document = await prepare(value => {
        if (request === generation.current) onReady(value);
      });
      if (request === generation.current) setContent(document);
    } catch (failure) {
      if (request === generation.current) {
        setError(failure instanceof Error ? failure.message : "เตรียมเอกสารพิมพ์ไม่สำเร็จ");
        reset();
      }
    }
  }, [onReady, reset]);

  useEffect(() => {
    if (!printing) return;
    const timer = window.setTimeout(() => {
      setError("เตรียมเอกสารพิมพ์ไม่สำเร็จภายในเวลาที่กำหนด กรุณาลองใหม่");
      reset();
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [printing, reset]);

  useEffect(() => {
    if (!content || !ready) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          await document.fonts.ready;
          const images = Array.from(document.querySelectorAll<HTMLImageElement>('[data-accounting-print-content] img'));
          await Promise.all(images.map(image => {
            image.loading = "eager";
            return image.decode();
          }));
          if (!cancelled) window.print();
        } catch (failure) {
          if (!cancelled) setError(failure instanceof Error ? failure.message : "โหลดรูปภาพเอกสารพิมพ์ไม่สำเร็จ");
        } finally {
          if (!cancelled) reset();
        }
      })();
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [content, ready, reset]);

  useEffect(() => () => { generation.current += 1; active.current = false; }, []);

  return {
    printing, error, requestPrint, reset, onReady,
    printContent: content ? <div data-accounting-print-content>
      <style>{`@media print {
        body *:not([data-accounting-print-content]):not([data-accounting-print-content] *):not(:has([data-accounting-print-content])) {
          display: none !important;
        }
        body *:has([data-accounting-print-content]) {
          display: block !important;
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }
      }`}</style>
      {content}
    </div> : null,
  };
}
