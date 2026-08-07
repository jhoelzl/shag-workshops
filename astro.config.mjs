import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://shagadeus.at',
  base: '/',
  output: 'server',
  adapter: vercel({
    isr: {
      // Revalidate every hour, but exclude workshops page for fresh content
      expiration: 3600,
      exclude: ['/en/workshops/*', '/de/workshops/*'],
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
});
