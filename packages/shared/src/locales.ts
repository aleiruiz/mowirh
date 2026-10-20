export const LOCALES = ['es', 'pt', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Readable (not httpOnly) cookie the web app renders with. The API sets it from
 * the saved profile preference at sign-in and clears it at sign-out.
 */
export const LOCALE_COOKIE = 'mowihr_locale';
