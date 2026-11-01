"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/lib/actions/sessions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import Input from "@/components/ui/Input";

export default function DeleteDiscussion({ session, contributionCount }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const isLive = session.status === "live";

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    setConfirmText("");
    setPassword("");
    setError(null);
  }

  async function handleDelete(event) {
    event?.preventDefault();
    if (pending || isLive || !canDelete) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteSession(session.id, {
        password,
        confirm_text: confirmText,
      });
      if (!result?.ok) {
        setError(result?.error || "Could not delete this discussion.");
        return;
      }

      setOpen(false);
      setConfirmText("");
      setPassword("");
      router.replace("/admin/sessions");
      router.refresh();
    } catch {
      setError("Could not delete this discussion. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const canDelete = !isLive && confirmText === "DELETE" && password.length > 0;

  return (
    <Card className="flex flex-col gap-3 border-crimson/30">
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-crimson-bright">
          Delete discussion
        </h3>
        <p className="text-sm leading-relaxed text-muted">
          Permanently remove this discussion, its contributions and its presentation state.
        </p>
        {isLive ? (
          <p role="status" className="text-sm font-medium text-gold">
            This discussion is live. Close it before deletion is available.
          </p>
        ) : null}
      </div>

      <Button
        variant="danger"
        disabled={isLive}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Delete Discussion
      </Button>

      <Dialog
        open={open}
        onClose={closeDialog}
        title="Permanently delete this discussion?"
        description="This action cannot be undone. Other discussions will not be affected."
      >
        <form onSubmit={handleDelete} className="flex flex-col gap-4">
          <dl className="rounded-control border border-crimson/30 bg-crimson/5 p-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted">Discussion</dt>
              <dd className="text-right font-semibold text-ink">{session.title}</dd>
            </div>
            {session.topic ? (
              <div className="mt-2 flex items-start justify-between gap-4">
                <dt className="text-muted">Topic</dt>
                <dd className="max-w-[65%] text-right text-ink">{session.topic}</dd>
              </div>
            ) : null}
            <div className="mt-2 flex items-start justify-between gap-4">
              <dt className="text-muted">Join code</dt>
              <dd className="font-mono font-semibold text-ink">{session.public_code}</dd>
            </div>
            <div className="mt-2 flex items-start justify-between gap-4">
              <dt className="text-muted">Contributions</dt>
              <dd className="font-semibold text-ink">{contributionCount}</dd>
            </div>
          </dl>

          <p className="text-sm leading-relaxed text-crimson-bright">
            The discussion and every contribution attached to it will be permanently deleted.
          </p>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Type DELETE to confirm
            <Input
              value={confirmText}
              onChange={(event) => {
                setConfirmText(event.target.value);
                setError(null);
              }}
              placeholder="DELETE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Admin password
            <Input
              type="password"
              data-dialog-autofocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              placeholder="Admin password"
              autoComplete="current-password"
              error={Boolean(error)}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm font-medium text-crimson-bright">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="danger"
              type="submit"
              loading={pending}
              disabled={!canDelete}
            >
              Permanently delete discussion
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
