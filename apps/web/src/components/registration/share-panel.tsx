'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { Button, Icon, Text } from '@/components/ui';

import styles from './registration.module.css';

/** Shareable link, copy / native share and a QR code (always dark on white so it scans in both themes). */
export function SharePanel({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const full = `${window.location.origin}${path}`;
    let live = true;
    // eslint-disable-next-line no-restricted-syntax -- design-exception: raster resolution of the QR image (2x its display size), not a layout value
    QRCode.toDataURL(full, { margin: 1, width: 384 }).then((d) => {
      if (!live) return;
      setUrl(full);
      setQr(d);
    });
    return () => {
      live = false;
    };
  }, [path]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is still shown as selectable text */
    }
  }
  return (
    <div className={styles.stack}>
      <Text variant="mono" className={styles.preBody}>
        {url}
      </Text>
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => void copy()}>
          <Icon name="link" /> {copied ? 'Copied' : 'Copy link'}
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator ? (
          <Button
            variant="secondary"
            onClick={() => void navigator.share({ title, url }).catch(() => undefined)}
          >
            Share
          </Button>
        ) : null}
      </div>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`QR code for ${title}`} className={styles.qr} />
      ) : null}
    </div>
  );
}
