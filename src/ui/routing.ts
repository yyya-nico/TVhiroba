import { useEffect, useState } from 'react';

export const paths = ['/', '/tv', '/input', '/settings', '/setup', '/setup/connection', '/setup/input', '/setup/links'] as const;
export type AppPath = typeof paths[number];

export function normalizePath(pathname: string): AppPath {
  const path = pathname.replace(/\/+$/, '') || '/';
  return paths.includes(path as AppPath) ? path as AppPath : '/';
}

export function setupDestination(search: string): AppPath {
  const next = normalizePath(new URLSearchParams(search).get('next') ?? '/');
  return next.startsWith('/setup') ? '/' : next;
}

export function setupUrl(path: AppPath, next: AppPath): string {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

export function setupRedirect(path: AppPath, serverConfigured: boolean, inputConfigured: boolean, linksConfigured: boolean): AppPath | null {
  const inSetup = path.startsWith('/setup');
  if (!serverConfigured) return !inSetup || path === '/setup/input' || path === '/setup/links' ? '/setup' : null;
  // Explicit setup steps remain available even when their saved settings exist.
  if (path === '/setup/connection' || path === '/setup/input') return null;
  if (!inputConfigured) return '/setup/input';
  if (path === '/setup/links') return null;
  if (!linksConfigured) return '/setup/links';
  return null;
}

export function useRoute() {
  const [location, setLocation] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const onPopState = () => setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  function navigate(url: string, replace = false) {
    if (`${window.location.pathname}${window.location.search}` === url) return;
    window.history[replace ? 'replaceState' : 'pushState']({ tvhiroba: true }, '', url);
    setLocation({ pathname: window.location.pathname, search: window.location.search });
  }
  return { ...location, path: normalizePath(location.pathname), navigate };
}
