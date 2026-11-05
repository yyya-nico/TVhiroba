const storageKey = 'tvhiroba.tv-selection';

export type TvPreferences = { broadcastType: string; channels: Record<string, number> };

export function readTvPreferences(): TvPreferences {
  const fallback: TvPreferences = { broadcastType: 'GR', channels: {} };
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value || typeof value !== 'object') return fallback;
    return {
      broadcastType: typeof value.broadcastType === 'string' && /^[A-Z0-9]+$/.test(value.broadcastType) ? value.broadcastType : 'GR',
      channels: Object.fromEntries(Object.entries(value.channels && typeof value.channels === 'object' ? value.channels : {})
        .filter(([type, id]) => /^[A-Z0-9]+$/.test(type) && Number.isSafeInteger(id) && Number(id) >= 0)),
    } as TvPreferences;
  } catch {
    return fallback;
  }
}

export function saveTvPreferences(value: TvPreferences): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Selection still works when browser storage is unavailable.
  }
}
