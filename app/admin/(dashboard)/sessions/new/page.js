import SessionForm from "@/components/admin/sessions/SessionForm";

export default function NewSessionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
          New discussion
        </h1>
        <p className="text-sm text-muted">
          Set the details now - you can publish whenever the room is ready.
        </p>
      </div>
      <SessionForm mode="create" session={null} />
    </div>
  );
}
