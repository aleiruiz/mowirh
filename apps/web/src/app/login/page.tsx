import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DevSignIn } from '@/components/dev-sign-in';
import { GoogleSignIn } from '@/components/google-sign-in';
import { getMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // If the API is unreachable, still show the page rather than an error screen.
  const me = await getMe().catch(() => null);
  if (me) redirect('/');
  const t = await getTranslations('login');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const devLogin = process.env.DEV_LOGIN_ENABLED === 'true';

  return (
    <main>
      <section className="card">
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
        {clientId ? (
          <GoogleSignIn clientId={clientId} hostedDomain={process.env.GOOGLE_WORKSPACE_DOMAIN} />
        ) : (
          <p className="error">{t('unavailable')}</p>
        )}
      </section>
      {devLogin && <DevSignIn />}
    </main>
  );
}
