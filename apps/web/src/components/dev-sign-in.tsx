'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiSend } from '@/lib/client-api';

/** Shown only when DEV_LOGIN_ENABLED=true; the API refuses dev login in staging and production. */
export function DevSignIn() {
  const t = useTranslations('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await apiSend('POST', '/auth/dev-login', { email }).catch(() => null);
    if (res?.ok) {
      router.replace('/');
      router.refresh();
    } else setError(res?.status === 401 ? t('refused') : t('unavailable'));
  }

  return (
    <section className="card">
      <h2>{t('devTitle')}</h2>
      <p className="muted">{t('devHint')}</p>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="dev-email">{t('devEmail')}</label>
        <input
          id="dev-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button className="primary" type="submit">
          {t('devSubmit')}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
