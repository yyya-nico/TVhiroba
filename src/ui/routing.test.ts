import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePath, paths, setupDestination, setupRedirect, setupUrl } from './routing';

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

test('保存・スキップ済みでも接続後の外部入力設定を表示する', () => {
  for (const linksConfigured of [false, true]) {
    assert.equal(setupRedirect('/setup/input', true, true, linksConfigured), null);
    assert.equal(setupRedirect('/setup/connection', true, true, linksConfigured), null);
  }
  assert.equal(setupRedirect('/setup/links', true, true, true), null);
});

test('通常画面では未完了の設定へ進み、前提の設定を飛ばさない', () => {
  assert.equal(setupRedirect('/', false, false, false), '/setup');
  assert.equal(setupRedirect('/setup/input', false, true, true), '/setup');
  assert.equal(setupRedirect('/setup/links', true, false, false), '/setup/input');
  assert.equal(setupRedirect('/', true, false, false), '/setup/input');
  assert.equal(setupRedirect('/', true, true, false), '/setup/links');
  assert.equal(setupRedirect('/', true, true, true), null);
});
