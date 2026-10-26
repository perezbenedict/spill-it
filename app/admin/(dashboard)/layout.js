import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import AdminNav from "@/components/admin/AdminNav";
import Button from "@/components/ui/Button";

export default async function AdminDashboardLayout({ children }) {
  const { role } = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2">
            <Image
              src="/gnwy-logo.png"
              alt=""
              width={928}
              height={1146}
              className="h-9 w-auto"
            />
            <span className="font-display text-xl font-bold tracking-tight text-cream">
              SPILL
            </span>
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-neutral-400 sm:inline">{role}</span>
            <form action={logout}>
              <Button type="submit" variant="primary" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
