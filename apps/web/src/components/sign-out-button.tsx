'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiSend } from '@/lib/client-api';

export function SignOutButton() {
  const t = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState(false);

  async function signOut() {
    setError(false);
    const res = await apiSend('POST', '/auth/logout').catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={signOut}>
        {t('signOut')}
      </button>
      {error && (
        <span className="error" role="alert">
          {t('signOutError')}
        </span>
      )}
    </>
  );
}
