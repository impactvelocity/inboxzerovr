import { NextResponse, type NextRequest } from 'next/server';

/**
 * /play (no slash) goes to /play/: the game's assets are relative, so it must be opened with the
 * slash. Done here, on the exact path, because a config redirect for /play also matches /play/
 * and sends it round in a loop.
 */
export function proxy(request: NextRequest) {
  if (new URL(request.url).pathname === '/play') {      // (the raw path: nextUrl would say /play for /play/ too)
    // (a plain URL: Next's own nextUrl drops the trailing slash again)
    return NextResponse.redirect(new URL(`/play/${request.nextUrl.search}`, request.url), 308);
  }
}

export const config = { matcher: ['/play'] };
