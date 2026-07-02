"use client";

import { QRCodeSVG } from "qrcode.react";

export interface QRCodePanelProps {
  joinUrl: string;
  size?: number;
}

/** QR-kód a /play/[room] URL-re + rövid URL (AC4.1, AC4.2, DESIGN H3). */
export function QRCodePanel({ joinUrl, size = 220 }: QRCodePanelProps) {
  const shortLabel = joinUrl.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-4 rounded-[var(--radius-card)]">
        <QRCodeSVG value={joinUrl} size={size} level="M" />
      </div>
      <span className="font-code text-sm text-text-muted">{shortLabel}</span>
    </div>
  );
}
