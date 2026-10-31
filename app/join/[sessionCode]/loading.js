import Spinner from "@/components/ui/Spinner";

export default function JoinLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-gutter py-section">
      <div
        role="status"
        className="flex flex-col items-center gap-4 text-center text-muted"
      >
        <Spinner className="h-8 w-8 text-gold" label="Loading discussion" />
        <p className="text-sm">Loading this conversation…</p>
      </div>
    </main>
  );
}
