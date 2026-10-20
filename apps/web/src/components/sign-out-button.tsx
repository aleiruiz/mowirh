'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiSend } from '@/lib/client-api';

export function SignOutButton() {
  const t = useTranslations('common');
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await apiSend('POST', '/auth/logout').catch(() => null);
        router.replace('/login');
        router.refresh();
      }}
    >
      {t('signOut')}
    </button>
  );
}
