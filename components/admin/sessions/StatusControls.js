"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { setSessionStatus, reopenSession } from "@/lib/actions/sessions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import StatusBadge from "@/components/admin/sessions/StatusBadge";

const ACTIONS = {
  draft: [{ next: "live", label: "Publish", icon: Play, variant: "primary" }],
  live: [
    { next: "paused", label: "Pause", icon: Pause, variant: "secondary" },
    { next: "closed", label: "Close", icon: XCircle, variant: "danger" },
  ],
  paused: [
    { next: "live", label: "Resume", icon: Play, variant: "primary" },
    { next: "closed", label: "Close", icon: XCircle, variant: "danger" },
  ],
  closed: [{ next: "reopen", label: "Reopen", icon: RotateCcw, variant: "primary" }],
};

function StatusActionForm({ next, label, icon: Icon, variant, disabled, onSubmitted }) {
  const { pending } = useFormStatus();
  return (
    <form action={onSubmitted} className="inline-flex">
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    </form>
  );
}

export default function StatusControls({ sessionId, status }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prevState, formData) => {
      const next = formData.get("next");
      if (next === "reopen") return reopenSession(sessionId);
      return setSessionStatus(sessionId, next);
    },
    { error: null }
  );

  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setConfirmClose(false);
      // Force the server-rendered parent (dashboard / session detail) to
      // refresh so the new status is reflected immediately.
      if (typeof window !== "undefined") {
        router.refresh();
      }
    }
  }, [state]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const actions = ACTIONS[status] ?? [];
  const isClosed = status === "closed";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Status</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Currently
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {isClosed ? (
        <div className="flex flex-wrap gap-3">
          <StatusActionForm
            next="reopen"
            label="Reopen discussion"
            icon={RotateCcw}
            variant="primary"
            disabled={pending}
            onSubmitted={formAction}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {actions.map((action) =>
            action.next === "closed" ? (
              <Button
                key={action.next}
                variant={action.variant}
                disabled={pending}
                onClick={() => setConfirmClose(true)}
              >
                <action.icon className="h-4 w-4" aria-hidden="true" />
                {action.label}
              </Button>
            ) : (
              <StatusActionForm
                key={action.next}
                {...action}
                disabled={pending}
                onSubmitted={formAction}
              />
            )
          )}
        </div>
      )}

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-crimson">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm font-medium text-gold">
          Status updated to {state.status}.
        </p>
      ) : null}

      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Close this discussion?"
        description="Participants will no longer be able to submit. Everything already contributed is kept - closing never deletes submissions."
      >
        <form action={formAction} className="flex flex-wrap gap-3">
          <input type="hidden" name="next" value="closed" />
          <Button type="submit" variant="danger" loading={pending}>
            Close discussion
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirmClose(false)}>
            Keep it open
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
