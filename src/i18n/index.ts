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

export function getAlternateLocale(locale: Locale): Locale {
  return locale === 'de' ? 'en' : 'de';
}
