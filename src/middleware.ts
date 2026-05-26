import { defineMiddleware } from 'astro:middleware';

function buildCspHeader(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://*.supabase.co",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "form-action 'self'",
  ];

  return directives.join('; ');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  if (pathname === '/flyer1' || pathname === '/flyer2' || pathname === '/flyer3') {
    return context.redirect(`${pathname}/${search}`, 301);
  }

  const response = await next();
  response.headers.set('Content-Security-Policy', buildCspHeader());

  return response;
});
