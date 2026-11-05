import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePath, paths, setupDestination, setupUrl } from './routing';

test('各画面のパスを認識し、末尾スラッシュと不明なパスを正規化する', () => {
  for (const path of paths) assert.equal(normalizePath(path), path);
  assert.equal(normalizePath('/settings/'), '/settings');
  assert.equal(normalizePath('/unknown'), '/');
});

test('セットアップの再読み込みでも元の画面を保持する', () => {
  for (const path of ['/', '/tv', '/input', '/settings'] as const) {
    const url = new URL(setupUrl('/setup/input', path), 'http://localhost');
    assert.equal(url.pathname, '/setup/input');
    assert.equal(setupDestination(url.search), path);
  }
});

test('セットアップ完了後の戻り先はアプリ内の通常画面に限定する', () => {
  for (const next of ['/setup', '/setup/input', '//example.com', 'https://example.com', '/unknown']) {
    assert.equal(setupDestination(`?next=${encodeURIComponent(next)}`), '/');
  }
});
