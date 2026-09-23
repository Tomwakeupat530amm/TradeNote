import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // If user hasn't explicitly set NEXT_LOCALE cookie yet
  const hasLocaleCookie = request.cookies.has('NEXT_LOCALE');

  if (!hasLocaleCookie) {
    // Check Geo-IP headers (e.g. Vercel, Cloudflare, AWS CloudFront)
    const country = request.headers.get('x-vercel-ip-country') || 
                    request.headers.get('cf-ipcountry') ||
                    request.headers.get('cloudfront-viewer-country');

    if (country === 'VN') {
      const headers = new Headers(request.headers);
      headers.set('accept-language', 'vi-VN,vi;q=0.9,en;q=0.8');
      const modifiedRequest = new NextRequest(request.url, { headers });
      return handleI18nRouting(modifiedRequest);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // Match only internationalized pathnames
  matcher: [
    // Enable a redirect to a matching locale at the root
    '/',
    // Set a cookie to remember the previous locale for all requests that have a locale prefix
    '/(en|vi)/:path*',
    // Enable redirects that add a locale prefix to requests without one (exclude api)
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
