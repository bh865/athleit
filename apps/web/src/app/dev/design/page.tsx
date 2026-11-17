import { notFound } from 'next/navigation';

import { Gallery } from './gallery';

/**
 * Dev-only design gallery: the visual-regression target that mirrors the design system.
 * Hidden in production unless NEXT_PUBLIC_DESIGN_GALLERY=1 (set by the Playwright config).
 */
export const metadata = { title: 'Design gallery' };

export default function DesignGalleryPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DESIGN_GALLERY !== '1')
    notFound();
  return <Gallery />;
}
