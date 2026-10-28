import { notFound } from "next/navigation";

import RoomDisplay from "@/components/room/RoomDisplay";
import { getAdminContext } from "@/lib/auth";
import { isValidPublicCode } from "@/lib/session-code";
import { getRoom } from "@/lib/spill-api";

async function getSession(publicCode) {
  const result = await getRoom(publicCode);
  if (result.status === 0 || !result.ok) {
    if (result.status === 404) return null;
    throw new Error("room lookup failed");
  }
  return result.body;
}

export async function generateMetadata({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) return { title: "Spill It room" };
  try {
    const body = await getSession(sessionCode.toUpperCase());
    return { title: body?.session ? `${body.session.title} - Spill It` : "Spill It room" };
  } catch {
    return { title: "Spill It room" };
  }
}

export default async function RoomPage({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) notFound();

  let body;
  try {
    body = await getSession(sessionCode.toUpperCase());
  } catch {
    body = undefined;
  }
  if (body === undefined) throw new Error("room lookup failed");
  if (!body || !body.session) notFound();

  const adminContext = await getAdminContext();

  return (
    <RoomDisplay
      session={{
        title: body.session.title,
        status: body.session.status,
        public_code: body.session.public_code,
      }}
      currentId={body.currentId ?? null}
      currentSubmission={body.currentSubmission ?? null}
      isAdmin={Boolean(adminContext)}
    />
  );
}
