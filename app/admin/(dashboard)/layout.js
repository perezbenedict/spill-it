import Link from "next/link";
import { Lock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import Emblem from "@/components/Emblem";
import AdminNav from "@/components/admin/AdminNav";
import Button from "@/components/ui/Button";

export default async function AdminDashboardLayout({ children }) {
  const { role } = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-midnight text-ink">
      {/* One sticky block so the topbar and section tabs never overlap. */}
      <div className="sticky top-0 z-20">
        <header className="border-b border-white/10 bg-surface/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/admin" className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 animate-emblem-drift">
                <Emblem className="h-full w-full" />
              </span>
              <h1 className="min-w-0 truncate text-sm text-muted">
                <span className="font-display text-base font-semibold text-ink sm:text-lg">
                  Spill It
                </span>{" "}
                — Response Vault
              </h1>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-muted sm:inline">
                {role}
              </span>
              <form action={logout}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-muted hover:text-ink"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Log out
                </Button>
              </form>
            </div>
          </div>
        </header>
        <nav
          aria-label="Admin sections"
          className="border-b border-white/10 bg-midnight/80 backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <AdminNav />
          </div>
        </nav>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
