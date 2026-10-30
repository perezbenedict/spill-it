import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth";
import Emblem from "@/components/Emblem";
import LoginForm from "@/components/admin/LoginForm";

export default async function AdminLoginPage() {
  if (await getAdminContext()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-midnight px-gutter py-12">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <span
            className="inline-flex h-28 w-28 animate-emblem-drift drop-shadow-[0_0_18px_rgba(167,139,250,0.25)] sm:h-32 sm:w-32"
            aria-label="Spill It"
          >
            <Emblem className="h-full w-full" />
          </span>
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
              Spill It
            </h1>
            <p className="mt-1 text-sm text-muted">
              Admin
            </p>
          </div>
        </div>
        <div className="rounded-card border border-white/10 bg-surface p-6 shadow-2xl sm:p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
