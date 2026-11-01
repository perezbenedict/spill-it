"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearSessionContributionsAction } from "@/lib/actions/moderation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Dialog from "@/components/ui/Dialog";

export default function ClearContributions({ sessionId, sessionTitle, count }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    setConfirmName("");
    setConfirmText("");
    setPassword("");
    setError(null);
  }

  async function handleClear() {
    if (pending || !canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await clearSessionContributionsAction(sessionId, {
        password,
        confirm_name: confirmName,
        confirm_text: confirmText,
      });
      if (result?.ok) {
        setSuccess(`Cleared ${result.deleted ?? 0} contribution${result.deleted === 1 ? "" : "s"}.`);
        setOpen(false);
        setConfirmName("");
        setConfirmText("");
        setPassword("");
        router.refresh();
      } else {
        setError(result?.error || "Could not clear contributions.");
      }
    } catch {
      setError("Could not clear contributions.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    confirmName.trim().toLowerCase() === String(sessionTitle ?? "").trim().toLowerCase() &&
    confirmText === "DELETE" &&
    password.length > 0;

  return (
    <Card className="flex flex-col gap-3 border-crimson/30">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-crimson-bright">
          Danger zone
        </h2>
        <p className="text-sm text-muted">
          Permanently delete every contribution in this discussion. This cannot be undone.
        </p>
      </div>
      <Button
        variant="danger"
        onClick={() => {
          setSuccess(null);
          setOpen(true);
        }}
      >
        Clear session contributions
      </Button>
      {success ? (
        <p role="status" className="text-sm font-medium text-gold">
          {success}
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={closeDialog}
        title="Clear all contributions?"
        description={`This will permanently delete ${count} contribution${count === 1 ? "" : "s"} from "${sessionTitle}". This cannot be undone.`}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !pending) handleClear();
          }}
        >
          <div className="rounded-control border border-crimson/30 bg-crimson/5 p-3">
            <p className="text-sm font-semibold text-ink">{sessionTitle}</p>
            <p className="mt-1 text-sm text-muted">
              {count} contribution{count === 1 ? "" : "s"} will be permanently deleted.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Discussion name
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={sessionTitle}
              error={undefined}
            />
            <span className="text-xs font-normal text-muted">Type the discussion name to confirm.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Type DELETE
            <Input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Admin password
            <Input
              type="password"
              data-dialog-autofocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoComplete="current-password"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-crimson">{error}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={pending}
              disabled={!canSubmit}
            >
              Permanently clear contributions
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
