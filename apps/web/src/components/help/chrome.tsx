'use client';
// The mobile app opens articles in its in-app browser with ?embed=1: the site header and footer are left out there.
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

export function Chrome({ children }: { children: ReactNode }) {
  return useSearchParams().get('embed') === '1' ? null : children;
}
