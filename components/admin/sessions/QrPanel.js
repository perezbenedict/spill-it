import Link from "next/link";
import { buildJoinUrl } from "@/lib/qr";
import ErrorState from "@/components/ui/ErrorState";
import QRCodeCard from "@/components/qr/QRCodeCard";

const linkClass =
  "inline-flex items-center rounded-control px-3 py-2 text-sm font-medium text-ink underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple";

export default function QrPanel({ publicCode }) {
  let joinUrl;
  try {
    joinUrl = buildJoinUrl(publicCode);
  } catch {
    return (
      <ErrorState
        title="Join link unavailable"
        description="NEXT_PUBLIC_SITE_URL must be configured to build the participant join link and QR code."
      />
    );
  }

  return (
    <section aria-labelledby="qr-panel-heading" className="flex flex-col gap-3">
      <h2 id="qr-panel-heading" className="font-display text-lg font-semibold text-ink">
        Share &amp; project
      </h2>
      <QRCodeCard url={joinUrl} fileName={`spill-${publicCode}.png`} />
      <nav aria-label="Session links" className="flex flex-wrap gap-1">
        <Link href={`/qr/${publicCode}`} className={linkClass}>
          Projector QR
        </Link>
        <Link href={`/poster/${publicCode}`} className={linkClass}>
          Printable poster
        </Link>
        <Link href={`/room/${publicCode}`} className={linkClass}>
          Presentation room
        </Link>
      </nav>
    </section>
  );
}
