import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (pathname === '/flyer1' || pathname === '/flyer2' || pathname === '/flyer3') {
    return context.redirect(`${pathname}/${search}`, 301);
  }

  return next();
});
