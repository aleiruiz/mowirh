import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LocaleSync } from '@/components/locale-sync';
import { SignOutButton } from '@/components/sign-out-button';
import { getMe } from '@/lib/api';

export default async function HomePage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations();

  return (
    <main>
      <LocaleSync saved={me.locale} />
      <header className="topbar">
        <span className="brand">{t('app.name')}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <LocaleSwitcher current={me.locale} />
          <SignOutButton />
        </div>
      </header>

      <section className="card">
        <h1>{t('home.greeting', { name: me.fullName })}</h1>
        <p className="muted">{me.email}</p>
      </section>

      <section className="card">
        <h2>{t('home.rolesTitle')}</h2>
        <ul className="chips">
          {me.roles.map((r) => (
            <li className="chip" key={`${r.role}-${r.areaId ?? ''}`}>
              {t(`roles.${r.role}`)}
            </li>
          ))}
        </ul>
      </section>

      <p className="muted">{t('home.comingSoon')}</p>
    </main>
  );
}
