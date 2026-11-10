import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import AudienceActivities from '@/components/director/AudienceActivities';
import LowBandwidth from '@/components/director/LowBandwidth';
import Card from '@/components/ui/Card';
import Emblem from '@/components/Emblem';
import { readEnv, getSiteUrl } from '@/lib/config';
import { generateQrDataUrl } from '@/lib/qr';
import { isValidPublicCode } from '@/lib/session-code';
import '@/app/stage.css';

export const dynamic='force-dynamic';
export const metadata={title:'Standalone audience · Spill It'};
export default async function StandaloneAudiencePage({params}){
  const code=String((await params).code||'').toUpperCase();
  if(!isValidPublicCode(code))notFound();
  const env=readEnv();
  const response=await fetch(`${env.SPILL_API_URL}/stages/${code}`,{headers:{Authorization:`Bearer ${env.SPILL_API_SECRET}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===404)notFound();
  if(!response.ok)throw Error('Stage temporarily unavailable.');
  const {item}=await response.json();
  const joinUrl=`${getSiteUrl().replace(/\/$/,'')}/stage/${code}/join`;
  const qr=await generateQrDataUrl(joinUrl);
  return <main className="participant-shell min-h-screen px-gutter py-10"><div className="mx-auto max-w-xl space-y-6">
    <header className="space-y-4"><Link href="/" className="inline-flex min-h-11 items-center text-sm text-gold-light">Spill It · Home</Link><Emblem className="h-12 w-12"/><p className="text-xs uppercase tracking-[.16em] text-gold-light">Standalone stage · audience</p><h1 className="break-words font-display text-4xl">{item.title||'A roomful of perspectives'}</h1><p className="text-sm text-muted">Join the activity your host opens below. No discussion registration or nickname is needed.</p></header>
    <LowBandwidth/>
    <AudienceActivities standalone code={code}/>
    <p role="status" className="text-sm text-muted">Activities appear automatically when the host opens participation. If no activity is open, stay on this page for the next moment.</p>
    <Card id="stage-join-qr" className="space-y-4 text-center"><h2 className="font-display text-2xl">Invite the room</h2><p className="text-sm text-muted">Scan to join this standalone stage’s audience.</p>{/* A self-contained QR works without an image service or extra audience identity. */}<Image unoptimized src={qr} alt="QR code to join this standalone audience" width={256} height={256} className="mx-auto rounded-control"/><a href={joinUrl} className="block break-all text-sm text-gold-light underline">{joinUrl}</a></Card>
  </div></main>;
}
