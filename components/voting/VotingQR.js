"use client";
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';

export default function VotingQR({ code, compact = false }) {
  const [image, setImage] = useState('');
  const [url, setURL] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const link = `${location.origin}/vote/${code}`;
    setImage(''); setError('');
    setURL(link);
    QRCode.toDataURL(link, { width: 640, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#160d2b', light: '#ffffff' } }).then(value => { if(live)setImage(value); }).catch(() => { if(live)setError('QR could not be generated. Use the direct voting link.'); });
    return () => { live = false; };
  }, [code]);
  return <div className={compact ? 'voting-qr voting-qr-compact' : 'voting-qr'}>{image ? <Image src={image} unoptimized alt="QR code to vote directly" width="640" height="640" /> : <p role="status">{error || 'Preparing voting QR…'}</p>}<p>Scan. Choose. Have your say.</p><a href={`/vote/${code}`} className="break-all underline underline-offset-4">{url || `/vote/${code}`}</a>{image && <a className="voting-qr-download" download={`spill-voting-${code}.png`} href={image}>Download QR</a>}</div>;
}
