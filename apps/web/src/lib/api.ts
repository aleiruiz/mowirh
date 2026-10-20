import 'server-only';
import type { Locale, Role } from '@mowihr/shared';
import { cookies } from 'next/headers';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  areaId: string | null;
  leaderId: string | null;
  country: string;
  locale: Locale;
  roles: { role: Role; areaId: string | null }[];
}

/** Calls the API from a server component, forwarding the visitor's session cookie. */
async function apiGet(path: string): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${apiUrl}${path}`, { headers: { cookie: cookieHeader }, cache: 'no-store' });
}

/** The signed-in person, or null if there is no valid session. */
export async function getMe(): Promise<Me | null> {
  const res = await apiGet('/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /me failed with ${res.status}`);
  return (await res.json()) as Me;
}
