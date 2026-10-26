import Badge from "@/components/ui/Badge";

const VARIANTS = {
  draft: "neutral",
  live: "success",
  paused: "warning",
  closed: "danger",
};

const LABELS = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  closed: "Closed",
};

// Status is always conveyed by the text label, never color alone.
export default function StatusBadge({ status }) {
  return <Badge variant={VARIANTS[status] ?? "neutral"}>{LABELS[status] ?? status}</Badge>;
}
