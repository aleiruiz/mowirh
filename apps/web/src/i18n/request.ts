import { DEFAULT_LOCALE, isLocale } from '@mowihr/shared';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

/** Cookie holding the person's chosen language; their saved preference is copied into it at sign-in. */
export const LOCALE_COOKIE = 'mowihr_locale';

export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
