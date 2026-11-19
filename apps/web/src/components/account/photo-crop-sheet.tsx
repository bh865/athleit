'use client';

import { AVATAR_OUTPUT_PX, squareCrop } from '@athleit/core';
import { useEffect, useRef, useState } from 'react';

import { Button, Sheet, Text } from '@/components/ui';

import styles from './account.module.css';

const VIEW = 240;

/** Canvas-based square crop: drag to reposition, slider to zoom. Output is a 512px JPEG blob. */
export function PhotoCropSheet({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setFailed(false);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setImg(el);
    };
    el.onerror = () => setFailed(true);
    el.src = url;
    return () => {
      URL.revokeObjectURL(url);
      setImg(null);
    };
  }, [file]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const crop = squareCrop(img.naturalWidth, img.naturalHeight, offset, zoom);
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, VIEW, VIEW);
    ctx?.drawImage(img, crop.sx, crop.sy, crop.size, crop.size, 0, 0, VIEW, VIEW);
  }, [img, offset, zoom]);

  const scale = () => (img ? Math.min(img.naturalWidth, img.naturalHeight) / zoom / VIEW : 1); // source px per view px

  function confirm() {
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = out.height = AVATAR_OUTPUT_PX;
    const crop = squareCrop(img.naturalWidth, img.naturalHeight, offset, zoom);
    out
      .getContext('2d')
      ?.drawImage(
        img,
        crop.sx,
        crop.sy,
        crop.size,
        crop.size,
        0,
        0,
        AVATAR_OUTPUT_PX,
        AVATAR_OUTPUT_PX,
      );
    out.toBlob((b) => b && onDone(b), 'image/jpeg', 0.9);
  }

  return (
    <Sheet open={!!file} onClose={onCancel} title="Crop photo" placement="right">
      <div className={styles.crop}>
        <Text variant="heading" as="h2">
          Crop photo
        </Text>
        <Text muted as="p">
          Drag to reposition. Your photo is cropped to a circle.
        </Text>
        {failed ? (
          <Text as="p" role="alert">
            We couldn’t read that image. Choose another photo.
          </Text>
        ) : (
          <canvas
            ref={canvas}
            width={VIEW}
            height={VIEW}
            className={styles.cropCanvas}
            role="img"
            aria-label="Photo preview. Drag, or use the arrow keys, to reposition."
            tabIndex={0}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const k = scale();
              setOffset((o) => ({
                x: o.x - (e.clientX - d.x) * k,
                y: o.y - (e.clientY - d.y) * k,
              }));
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={(e) => {
              const step = 12 * scale();
              const d: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const v = d[e.key];
              if (!v) return;
              e.preventDefault();
              setOffset((o) => ({ x: o.x + v[0], y: o.y + v[1] }));
            }}
          />
        )}
        <label>
          <span className="t-caption">Zoom</span>{' '}
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
        </label>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!img}>
            Use photo
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
