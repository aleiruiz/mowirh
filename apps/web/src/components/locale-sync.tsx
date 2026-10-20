'use client';

import type { Locale } from '@mowihr/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { readLocaleCookie, setLocaleCookie } from '@/lib/client-api';

/** After sign-in on a new device, switches the UI to the language saved on the profile. */
export function LocaleSync({ saved }: { saved: Locale }) {
  const router = useRouter();
  useEffect(() => {
    if (readLocaleCookie() !== saved) {
      setLocaleCookie(saved);
      router.refresh();
    }
  }, [saved, router]);
  return null;
}
