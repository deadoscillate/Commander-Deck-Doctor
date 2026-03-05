"use client";

import { useState } from "react";
import type { AnalyzeResponse } from "@/lib/contracts";
import { buildPlaintextReport } from "@/lib/reportText";

type ExportButtonsProps = {
  result: AnalyzeResponse | null;
  decklist: string;
};

type ShareResponse = {
  hash: string;
  path: string;
  url: string;
};

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand path below.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function ExportButtons({ result, decklist }: ExportButtonsProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "error">("idle");
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "ready" | "copied" | "error">("idle");
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");

  async function onCopy() {
    if (!result) {
      return;
    }

    try {
      const copied = await copyToClipboard(buildPlaintextReport(result));
      if (!copied) {
        throw new Error("Copy unavailable.");
      }
      setCopyStatus("ok");
      setTimeout(() => setCopyStatus("idle"), 1600);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }

  function onDownloadJson() {
    if (!result) {
      return;
    }

    const payload = JSON.stringify(result, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `commander-deck-doctor-report-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function onShare() {
    if (!result) {
      return;
    }

    const normalizedDecklist = decklist.trim();
    if (!normalizedDecklist) {
      setShareError("Decklist is required for sharing.");
      setShareStatus("error");
      return;
    }

    setShareStatus("loading");
    setShareUrl("");
    setShareError("");

    try {
      const response = await fetch("/api/share-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decklist: normalizedDecklist,
          analysis: result
        })
      });

      const payload = (await response.json()) as ShareResponse | { error: string };
      if (!response.ok) {
        setShareError("error" in payload ? payload.error : "Share failed.");
        setShareStatus("error");
        return;
      }

      const sharePayload = payload as ShareResponse;
      const resolvedUrl = sharePayload.url ||
        (sharePayload.path && typeof window !== "undefined"
          ? `${window.location.origin}${sharePayload.path}`
          : "");
      if (!resolvedUrl) {
        setShareError("Share response did not include a valid URL.");
        setShareStatus("error");
        return;
      }
      setShareUrl(resolvedUrl);

      try {
        const copied = await copyToClipboard(resolvedUrl);
        if (copied) {
          setShareStatus("copied");
        } else {
          setShareStatus("ready");
        }
      } catch {
        setShareStatus("ready");
      }
    } catch {
      setShareError("Share request failed.");
      setShareStatus("error");
    }
  }

  return (
    <div className="export-actions">
      <button type="button" disabled={!result} onClick={onCopy}>
        Copy Report
      </button>
      <button type="button" disabled={!result} onClick={onDownloadJson}>
        Download JSON
      </button>
      <button type="button" disabled={!result || !decklist.trim() || shareStatus === "loading"} onClick={onShare}>
        {shareStatus === "loading" ? "Sharing..." : "Share Deck Report"}
      </button>
      {copyStatus === "ok" ? <span className="muted">Copied.</span> : null}
      {copyStatus === "error" ? <span className="error-inline">Copy failed.</span> : null}
      {shareStatus === "copied" ? <span className="muted">Share link copied.</span> : null}
      {shareStatus === "ready" ? <span className="muted">Share link created.</span> : null}
      {shareUrl ? (
        <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
          Open shared report
        </a>
      ) : null}
      {shareStatus === "error" ? <span className="error-inline">{shareError || "Share failed."}</span> : null}
    </div>
  );
}
