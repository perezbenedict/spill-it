"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/admin/sessions/StatusBadge";

const linkClass =
  "inline-flex items-center justify-center rounded-control px-3 py-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SessionsList({ sessions }) {
  return (
    <MotionConfig reducedMotion="user">
      <ul className="flex flex-col gap-3">
        {sessions.map((session, index) => {
          const opensAt = formatDate(session.opens_at);
          const closesAt = formatDate(session.closes_at);
          const lastActivity =
            formatDate(session.updated_at) ?? formatDate(session.created_at);
          return (
            <motion.li
              key={session.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: Math.min(index * 0.05, 0.4),
                ease: "easeOut",
              }}
            >
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {session.title}
                  </h2>
                  <StatusBadge status={session.status} />
                  <span className="rounded-pill border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-xs font-medium text-ink">
                    {session.public_code}
                  </span>
                </div>

                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    <dt className="sr-only">Last activity</dt>
                    <dd>Last activity {lastActivity ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Created</dt>
                    <dd>Created {new Date(session.created_at).toLocaleDateString()}</dd>
                  </div>
                  {opensAt ? (
                    <div>
                      <dt className="sr-only">Opens</dt>
                      <dd>Opens {opensAt}</dd>
                    </div>
                  ) : null}
                  {closesAt ? (
                    <div>
                      <dt className="sr-only">Closes</dt>
                      <dd>Closes {closesAt}</dd>
                    </div>
                  ) : null}
                </dl>

                <nav
                  aria-label={`Actions for ${session.title}`}
                  className="flex flex-wrap gap-2 border-t border-white/10 pt-3"
                >
                  <Link
                    href={`/admin/sessions/${session.id}`}
                    className={`${linkClass} bg-gold text-midnight hover:bg-gold-light`}
                  >
                    Manage
                  </Link>
                  {session.status !== "draft" ? (
                    <>
                      <Link
                        href={`/admin/sessions/${session.id}/live`}
                        className={linkClass}
                      >
                        Live moderation
                      </Link>
                      <Link
                        href={`/room/${session.public_code}`}
                        className={linkClass}
                      >
                        Presentation room
                      </Link>
                    </>
                  ) : null}
                </nav>
              </Card>
            </motion.li>
          );
        })}
      </ul>
    </MotionConfig>
  );
}
