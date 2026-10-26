import QRCode from "qrcode";
import { getSiteUrl } from "@/lib/config";

// Dark ink on white with a quiet-zone margin: high contrast for scanning and printing.
const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  width: 512,
  color: { dark: "#16121F", light: "#FFFFFF" },
};

function assertText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("QR generation failed");
  }
}

// Always built from the validated site URL so a localhost value never reaches a production QR.
export function buildJoinUrl(publicCode) {
  return `${getSiteUrl()}/join/${publicCode}`;
}

export async function generateQrDataUrl(text) {
  assertText(text);
  try {
    return await QRCode.toDataURL(text, QR_OPTIONS);
  } catch {
    throw new Error("QR generation failed");
  }
}

export async function generateQrPngBuffer(text) {
  assertText(text);
  try {
    return await QRCode.toBuffer(text, QR_OPTIONS);
  } catch {
    throw new Error("QR generation failed");
  }
}
