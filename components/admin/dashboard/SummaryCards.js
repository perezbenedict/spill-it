import { MessagesSquare, HelpCircle, Lightbulb, Flame, Clock } from "lucide-react";
import Card from "@/components/ui/Card";

const CARDS = [
  { key: "total", label: "Total submissions", icon: MessagesSquare },
  { key: "question", label: "Questions", icon: HelpCircle },
  { key: "opinion", label: "Opinions", icon: Lightbulb },
  { key: "challenge", label: "Challenges", icon: Flame },
  { key: "pending", label: "Awaiting moderation", icon: Clock },
];

export default function SummaryCards({ total, question, opinion, challenge, pending }) {
  const values = { total, question, opinion, challenge, pending };

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
      {CARDS.map(({ key, label, icon: Icon }) => (
        <Card key={key} className="flex flex-col gap-2 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-purple">
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-medium text-muted">{label}</span>
          </div>
          <p className="font-display text-3xl font-bold text-ink sm:text-4xl">
            {values[key]}
          </p>
        </Card>
      ))}
    </div>
  );
}
