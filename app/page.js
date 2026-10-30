import AnimatedBackground from "@/components/background/AnimatedBackground";
import HomePageContent from "@/components/HomePageContent";
import { getLiveSession } from "@/lib/spill-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let session = null;
  try {
    const result = await getLiveSession();
    if (result.ok) session = result.body?.session ?? null;
  } catch {
    session = null;
  }

  return (
    <AnimatedBackground>
      <HomePageContent session={session} />
    </AnimatedBackground>
  );
}
