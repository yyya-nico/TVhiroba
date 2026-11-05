export type ExternalLink = { id: string; name: string; url: string; newTab: boolean };
const storageKey = 'tvhiroba.external-links';

export function normalizeExternalUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('HTTPまたはHTTPSのURLを入力してください。');
  return url.href;
}

export function readExternalLinks(): ExternalLink[] | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return undefined;
    const ids = new Set<string>();
    return value.map((link) => {
      if (!link || typeof link.id !== 'string' || !link.id || ids.has(link.id) || typeof link.name !== 'string' || !link.name.trim() || typeof link.url !== 'string' || typeof link.newTab !== 'boolean') throw new Error('Invalid link');
      ids.add(link.id);
      return { id: link.id, name: link.name.trim(), url: normalizeExternalUrl(link.url), newTab: link.newTab };
    });
  } catch { return undefined; }
}

export function saveExternalLinks(links: ExternalLink[]): void {
  localStorage.setItem(storageKey, JSON.stringify(links));
}
