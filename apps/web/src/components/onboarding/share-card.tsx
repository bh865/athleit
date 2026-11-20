'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';

import styles from './onboarding.module.css';

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line no-restricted-syntax -- design-exception: raster resolution of the QR image (2x its display size), not a layout value
    QRCode.toDataURL(text, { margin: 1, width: 384 }).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [text]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code" className={styles.qr} /> : null;
}

/** A value to hand to someone else: shown in mono with Copy, Share (where the browser has it) and an optional QR code. */
export function ShareCard({
  label,
  value,
  shareMessage,
  qr,
}: {
  label: string;
  value: string;
  shareMessage: string;
  qr?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className={styles.stack}>
      <p className={styles.kicker}>{label}</p>
      <p className={styles.code} aria-label={`${label}: ${value.split('').join(' ')}`}>
        {value}
      </p>
      {qr ? <Qr text={value} /> : null}
      <div className={styles.row}>
        <Button
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void navigator.share({ text: shareMessage })}>
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}
