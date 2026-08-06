import de from './de.json';
import en from './en.json';

const translations = { de, en } as const;

export type Locale = keyof typeof translations;
export type TranslationKeys = typeof de;

export function getLocale(url: URL): Locale {
  const [, lang] = url.pathname.split('/');
  if (lang === 'en') return 'en';
  return 'de';
}

export function t(locale: Locale): TranslationKeys {
  return translations[locale];
}

export function getLocalizedPath(path: string, locale: Locale): string {
  return `/${locale}${path}`;
}

// Paths that differ between locales (key = DE slug, value = EN slug)
const pathTranslations: Record<string, string> = {
  '/impressum/': '/imprint/',
  '/datenschutz/': '/privacy/',
  '/ueber-uns/': '/about/',
  '/archiv/': '/archive/',
};

/** Translate a currentPath from one locale to the other. */
export function translatePath(path: string, fromLocale: Locale): string {
  if (fromLocale === 'de') {
    return pathTranslations[path] ?? path;
  } else {
    const deSlug = Object.entries(pathTranslations).find(([, en]) => en === path)?.[0];
    return deSlug ?? path;
  }
}

export function getAlternateLocale(locale: Locale): Locale {
  return locale === 'de' ? 'en' : 'de';
}
