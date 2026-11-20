import { ANDROID_FINGERPRINT, androidAssetLinks } from '@athleit/core';
import { NextResponse } from 'next/server';

// Read the fingerprints at request time, so one build works for every environment.
export const dynamic = 'force-dynamic';

const PACKAGE_NAME = 'com.athleit.app';

/**
 * Android verifies the app's `autoVerify` intent filters against this file. Set ANDROID_CERT_SHA256 to
 * the signing certificate fingerprint(s), comma separated (Play Console > App signing shows them).
 * Without valid values this answers 404 rather than serving a placeholder.
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  if (fingerprints.length === 0 || !fingerprints.every((f) => ANDROID_FINGERPRINT.test(f))) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(androidAssetLinks(PACKAGE_NAME, fingerprints), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
