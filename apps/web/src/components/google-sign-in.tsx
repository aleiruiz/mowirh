'use client';

import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { apiSend } from '@/lib/client-api';

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    hd?: string;
    ux_mode?: 'popup' | 'redirect';
  }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/**
 * Google Identity Services button. The ID token goes to the API, which checks the
 * signature, audience and Workspace domain before opening a session.
 */
export function GoogleSignIn({
  clientId,
  hostedDomain,
}: {
  clientId: string;
  hostedDomain?: string;
}) {
  const t = useTranslations('login');
  const locale = useLocale();
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onCredential = useCallback(
    async ({ credential }: { credential: string }) => {
      setError(null);
      const res = await apiSend('POST', '/auth/google', { credential }).catch(() => null);
      if (res?.ok) {
        router.replace('/');
        router.refresh();
      } else {
        setError(res?.status === 401 ? t('refused') : t('unavailable'));
      }
    },
    [t, router],
  );

  const init = useCallback(() => {
    const google = window.google;
    if (!google || !buttonRef.current) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: onCredential,
      hd: hostedDomain,
    });
    google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      locale,
    });
  }, [clientId, hostedDomain, onCredential, locale]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={init}
        onError={() => setError(t('unavailable'))}
      />
      <div ref={buttonRef} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
