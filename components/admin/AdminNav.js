"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/sessions", label: "Sessions" },
];

function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-control px-3 py-2 text-sm transition-colors",
              // Active state is weight + underline, not color alone.
              active
                ? "font-semibold text-cream underline decoration-lime decoration-2 underline-offset-4"
                : "text-neutral-300 hover:text-cream"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
