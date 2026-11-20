import { appleAppSiteAssociation } from '@athleit/core';
import { NextResponse } from 'next/server';

// Read the team id at request time, so one build works for every environment.
export const dynamic = 'force-dynamic';

const BUNDLE_ID = 'com.athleit.app';

/**
 * iOS fetches this to learn which https paths open the app (the `applinks:athleit.app` entry in
 * app.json). It needs the Apple Developer Team ID, which is not in the repo: set APPLE_TEAM_ID on the
 * server. Without it this answers 404 rather than serving a made-up app id.
 */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(appleAppSiteAssociation(teamId, BUNDLE_ID), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
