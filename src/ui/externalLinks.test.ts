import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeExternalUrl, readExternalLinks, saveExternalLinks } from './externalLinks';

test('外部リンクの未設定と0件保存を区別し、開き方を復元する', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  assert.equal(readExternalLinks(), undefined);
  saveExternalLinks([]);
  assert.deepEqual(readExternalLinks(), []);
  const links = [false, true].map((newTab, i) => ({ id: String(i), name: `サイト${i}`, url: 'https://example.com/', newTab }));
  saveExternalLinks(links);
  assert.deepEqual(readExternalLinks(), links);
  storage.set('tvhiroba.external-links', JSON.stringify([{ ...links[0], url: 'javascript:alert(1)' }]));
  assert.equal(readExternalLinks(), undefined);
});

test('外部リンクはHTTPとHTTPSのみ許可する', () => {
  assert.equal(normalizeExternalUrl(' https://example.com '), 'https://example.com/');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/settings', 'file:///tmp/test']) {
    assert.throws(() => normalizeExternalUrl(url));
  }
});
