import Link from 'next/link';

export default function StageModeChoice({ mode = 'discussion' }) {
  return <nav aria-label="Stage mode" className="mb-6 flex flex-wrap gap-3">
    <Link href="/admin/stage" aria-current={mode === 'discussion' ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-control border px-4 py-2 text-sm text-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === 'discussion' ? 'border-gold/60 bg-gold/15' : 'border-gold/30'}`}>Discussion Stage</Link>
    <Link href="/admin/stage?mode=standalone" aria-current={mode === 'standalone' ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-control border px-4 py-2 text-sm text-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === 'standalone' ? 'border-gold/60 bg-gold/15' : 'border-gold/30'}`}>Standalone Stage</Link>
  </nav>;
}
