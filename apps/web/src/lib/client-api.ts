import { LOCALE_COOKIE } from '@mowihr/shared';

/** Same-origin calls to the API through the /api rewrite (see next.config.ts). */
export async function apiSend(method: 'POST' | 'PATCH', path: string, body?: unknown) {
  return fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function setLocaleCookie(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}

export function readLocaleCookie(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.split('=')[1];
}
