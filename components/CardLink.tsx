"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardPreviewPopover } from "@/components/CardPreviewPopover";
import type { CardPreviewData } from "@/lib/previewCache";
import { getCardPreview } from "@/lib/scryfallPreview";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 150;

type CardLinkProps = {
  name: string;
  className?: string;
};

export function CardLink({ name, className }: CardLinkProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [preview, setPreview] = useState<CardPreviewData | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
      }

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor || typeof window === "undefined") {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const previewWidth = 244;
      const gap = 8;
      const viewportPadding = 8;
      let left = rect.right + gap;

      if (left + previewWidth + viewportPadding > window.innerWidth) {
        left = Math.max(viewportPadding, rect.left - gap - previewWidth);
      }

      let top = rect.top + rect.height / 2;
      top = Math.max(viewportPadding + 24, Math.min(top, window.innerHeight - viewportPadding - 24));

      setPopoverStyle({
        top,
        left
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function clearOpenTimer() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function isTouchLikeInput(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia("(hover: none)").matches;
  }

  async function ensurePreviewLoaded() {
    if (state === "loading" || state === "ready" || state === "error") {
      return;
    }

    setState("loading");
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const resolved = await getCardPreview(name);
    if (requestIdRef.current !== requestId) {
      return;
    }

    setPreview(resolved);
    setState(resolved ? "ready" : "error");
  }

  function openWithDelay() {
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      setOpen(true);
      void ensurePreviewLoaded();
    }, OPEN_DELAY_MS);
  }

  function closeWithDelay() {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  return (
    <span
      ref={anchorRef}
      className={`card-hover${className ? ` ${className}` : ""}`}
      onMouseEnter={openWithDelay}
      onMouseLeave={closeWithDelay}
    >
      <span
        className="card-hover-text"
        onFocus={openWithDelay}
        onBlur={closeWithDelay}
        onClick={() => {
          if (!isTouchLikeInput()) {
            return;
          }

          clearOpenTimer();
          clearCloseTimer();
          if (open) {
            setOpen(false);
            return;
          }

          setOpen(true);
          void ensurePreviewLoaded();
        }}
        role="button"
        tabIndex={0}
      >
        {name}
      </span>

      {typeof document !== "undefined"
        ? createPortal(
            <CardPreviewPopover
              open={open}
              state={state}
              preview={preview}
              cardName={name}
              className="card-hover-preview-portal"
              style={popoverStyle}
              onMouseEnter={() => {
                clearCloseTimer();
              }}
              onMouseLeave={closeWithDelay}
            />,
            document.body
          )
        : null}
    </span>
  );
}
