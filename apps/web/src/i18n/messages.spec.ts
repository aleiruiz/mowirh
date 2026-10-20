import { LOCALES } from '@mowihr/shared';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import pt from '../../messages/pt.json';

const catalogs = { es, pt, en } as const;

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('message catalogs', () => {
  it('has a catalog for every supported locale', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...LOCALES].sort());
  });

  it.each(['pt', 'en'] as const)('%s has exactly the same keys as es', (locale) => {
    expect(keys(catalogs[locale]).sort()).toEqual(keys(es).sort());
  });
});
