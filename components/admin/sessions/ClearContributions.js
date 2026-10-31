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

  async function handleClear() {
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
      <Button variant="danger" onClick={() => setOpen(true)}>
        Clear session contributions
      </Button>
      {success ? (
        <p role="status" className="text-sm font-medium text-gold">
          {success}
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Clear all contributions?"
        description={`This will permanently delete ${count} contribution${count === 1 ? "" : "s"} from "${sessionTitle}". This cannot be undone.`}
      >
        <div className="flex flex-col gap-3">
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={sessionTitle}
            error={undefined}
          />
          <p className="text-xs text-muted">Type the discussion name to confirm.</p>
          <Input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE"'
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
          />
          {error ? (
            <p role="alert" className="text-sm font-medium text-crimson">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={!canSubmit}
              onClick={handleClear}
            >
              Clear all
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
