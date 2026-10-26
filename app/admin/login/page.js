import Image from "next/image";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export default async function AdminLoginPage() {
  if (await getAdminContext()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-gutter py-12">
      <div className="w-full max-w-md rounded-card bg-ink p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src="/gnwy-logo.png"
            alt="GNWY - Grace Nation Wealthy Youths"
            width={928}
            height={1146}
            priority
            className="h-auto w-28"
          />
          <h1 className="font-display text-4xl font-bold tracking-tight text-cream">SPILL</h1>
          <p className="text-sm text-neutral-300">Say what you really think.</p>
        </div>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
