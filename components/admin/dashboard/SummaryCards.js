import Card from "@/components/ui/Card";

const CARDS = [
  { key: "total", label: "Total" },
  { key: "pending", label: "Awaiting review" },
  { key: "question", label: "Questions" },
  { key: "opinion", label: "Opinions" },
  { key: "challenge", label: "Challenges" },
];

export default function SummaryCards({ total, question, opinion, challenge, pending }) {
  const values = { total, question, opinion, challenge, pending };

  return (
    <section aria-label="Submission counts" className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Submissions
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {CARDS.map(({ key, label }) => (
          <Card key={key} className="flex flex-col gap-1 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {label}
            </span>
            <span
              className={
                key === "pending" && values[key] > 0
                  ? "text-xl font-semibold tabular-nums text-gold"
                  : "text-xl font-semibold tabular-nums text-ink"
              }
            >
              {values[key]}
            </span>
          </Card>
        ))}
      </div>
    </section>
  );
}
