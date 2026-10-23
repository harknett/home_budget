import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content Security Policy, with a nonce.
 *
 * This cannot live in `next.config.ts` alongside the other security headers.
 * Next streams the page's data to the browser inside inline `<script>` tags,
 * and a policy of `script-src 'self'` blocks every one of them: the page still
 * renders, the server logs nothing, and React then fails to hydrate with the
 * unhelpful minified error #412. The visible symptom is that everything
 * interactive quietly stops - conditional fields never appear, tab switches do
 * nothing - while the pages themselves look fine.
 *
 * A fresh nonce per request is the fix. Next parses this header during
 * rendering and stamps the nonce onto its own scripts, so they run and nothing
 * an attacker injects does.
 *
 * `'strict-dynamic'` lets a nonced script load the chunks it needs without
 * naming every one. Styles keep `'unsafe-inline'` and deliberately take no
 * nonce: Next inlines critical CSS, and a nonce in `style-src` would make
 * browsers ignore `'unsafe-inline'` and drop that CSS on the floor.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // React uses eval in development to rebuild server stacks in the browser.
  // Production needs nothing of the sort.
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static assets need no policy, and a prefetch is not a page render -
      // giving one a nonce would hand the prefetched HTML a nonce that no
      // longer matches by the time it is used.
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
