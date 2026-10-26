import { notFound } from "next/navigation";

import RoomDisplay from "@/components/room/RoomDisplay";
import { getAdminContext } from "@/lib/auth";
import { isValidPublicCode } from "@/lib/session-code";
import { createClient } from "@/lib/supabase/server";

// moderation_status/hidden_from_presentation are selected because the display
// must enforce visibility itself: an admin's cookies bypass the approved-only
// RLS filter, so the server row is filtered here too.
const SUBMISSION_FIELDS =
  "id, nickname, category, content, moderation_status, is_pinned, hidden_from_presentation, created_at";

async function getSession(supabase, publicCode) {
  const { data, error } = await supabase
    .from("discussion_sessions")
    .select("id, title, status, public_code")
    .eq("public_code", publicCode)
    .maybeSingle();
  if (error) throw error;
  // RLS hides drafts; the extra check keeps the guarantee explicit.
  if (!data || data.status === "draft") return null;
  return data;
}

export async function generateMetadata({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) return { title: "SPILL room" };
  try {
    const supabase = await createClient();
    const session = await getSession(supabase, sessionCode.toUpperCase());
    return { title: session ? `${session.title} - SPILL` : "SPILL room" };
  } catch {
    return { title: "SPILL room" };
  }
}

export default async function RoomPage({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) notFound();

  const supabase = await createClient();
  const session = await getSession(supabase, sessionCode.toUpperCase());
  if (!session) notFound();

  const { data: presentationState } = await supabase
    .from("presentation_state")
    .select("current_submission_id")
    .eq("session_id", session.id)
    .maybeSingle();
  const pointedId = presentationState?.current_submission_id ?? null;

  let currentSubmission = null;
  if (pointedId) {
    // RLS returns null unless the row is approved and readable, which is
    // exactly the safety rule: an unapproved or removed contribution never
    // reaches the display. The explicit checks cover admin cookies, which
    // bypass the approved-only filter.
    const { data } = await supabase
      .from("submissions")
      .select(SUBMISSION_FIELDS)
      .eq("id", pointedId)
      .maybeSingle();
    if (data && data.moderation_status === "approved" && !data.hidden_from_presentation) {
      currentSubmission = data;
    }
  }

  const adminContext = await getAdminContext();

  return (
    <RoomDisplay
      session={{
        title: session.title,
        status: session.status,
        public_code: session.public_code,
      }}
      sessionId={session.id}
      currentId={currentSubmission?.id ?? null}
      currentSubmission={currentSubmission}
      isAdmin={Boolean(adminContext)}
    />
  );
}
