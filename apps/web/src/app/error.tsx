'use client';

import { useTranslations } from 'next-intl';

/** Shown when a page fails to render, most often because the API is unreachable. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <main>
      <section className="card" role="alert">
        <h1>{t('errorTitle')}</h1>
        <p className="muted">{t('errorBody')}</p>
        <button className="primary" type="button" onClick={() => reset()}>
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
