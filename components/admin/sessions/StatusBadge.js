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

export default function StatusBadge({ status }) {
  return (
    <Badge
      variant={VARIANTS[status] ?? "neutral"}
      className="font-semibold uppercase tracking-[0.14em]"
    >
      {LABELS[status] ?? status}
    </Badge>
  );
}
