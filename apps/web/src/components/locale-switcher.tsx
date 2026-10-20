'use client';

import { LOCALES, type Locale } from '@mowihr/shared';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { apiSend, setLocaleCookie } from '@/lib/client-api';

/** Saves the language on the person's profile, so it follows them across devices. */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  async function change(locale: Locale) {
    setError(false);
    const res = await apiSend('PATCH', '/me/preferences', { locale }).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    setLocaleCookie(locale);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <label className="sr-only" htmlFor="locale">
        {t('common.language')}
      </label>
      <select
        id="locale"
        aria-label={t('common.language')}
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
      {error && (
        <span className="error" role="alert">
          {t('common.saveError')}
        </span>
      )}
    </>
  );
}
