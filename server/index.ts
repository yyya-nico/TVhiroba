import express from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamProxy } from './stream';

const app = express();
const port = Number(process.env.PORT ?? 4174);
const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, 'data', 'config.json');
app.use(express.json({ limit: '16kb' }));

type AppConfig = { mirakcUrl: string };
type JsonObject = Record<string, unknown>;
type TvProgram = { id?: number; name?: string; description?: string; startAt: number; duration: number };
type TvService = { id: number; serviceId: number; networkId?: number; remoteControlKeyId?: number; name: string; type?: number; channelType: string; isSubchannel: boolean; currentProgram: TvProgram | null; nextProgram: TvProgram | null };
async function readConfig(): Promise<AppConfig> {
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as AppConfig;
  } catch {
    return { mirakcUrl: '' };
  }
}
function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('アドレスを入力してください');
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http または https のURLを入力してください');
  return url.toString().replace(/\/$/, '');
}
async function upstream(pathname: string, timeoutMs = 15000, signal?: AbortSignal): Promise<Response> {
  const { mirakcUrl } = await readConfig();
  if (!mirakcUrl) throw new Error('先にmirakcのアドレスを設定してください');
  return fetch(`${mirakcUrl}${pathname}`, {
    headers: { accept: '*/*' },
    signal: timeoutMs > 0 ? (signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)) : signal,
  });
}
function objectOf(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : null;
}
function arrayOf(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectOf).filter((item): item is JsonObject => item !== null) : [];
}
function numberOf(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}
function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function channelKey(type: unknown, channel: unknown): string {
  return `${String(type ?? '').toUpperCase()}:${String(channel ?? '')}`;
}
function isSubchannel(channelType: string, serviceId: number): boolean {
  const type = channelType.toUpperCase();
  if (type === 'GR') return (serviceId & 0x0187) !== 0;
  if (type === 'BS') {
    return [102, 104, 232, 233].includes(serviceId) ||
      [[142, 149], [152, 159], [162, 169], [172, 179], [182, 189]].some(([start, end]) => serviceId >= start && serviceId <= end);
  }
  return false;
}
function toProgram(raw: JsonObject): (TvProgram & { serviceId?: number; networkId?: number }) | null {
  const startAt = numberOf(raw.startAt);
  const duration = numberOf(raw.duration);
  if (startAt === undefined || duration === undefined || duration <= 0) return null;
  return {
    id: numberOf(raw.id),
    name: stringOf(raw.name),
    description: stringOf(raw.description),
    startAt,
    duration,
    serviceId: numberOf(raw.serviceId),
    networkId: numberOf(raw.networkId),
  };
}
function remoteControlKeyId(channelType: string, serviceId: number, apiValue: unknown): number | undefined {
  if (channelType.toUpperCase() === 'BS') {
    const assignments = [
      [101, 102, 1], [103, 104, 3], [141, 149, 4], [151, 159, 5],
      [161, 169, 6], [171, 179, 7], [181, 189, 8], [191, 193, 9],
      [200, 202, 10], [211, 211, 11], [222, 222, 12],
    ];
    const assignment = assignments.find(([start, end]) => serviceId >= start && serviceId <= end);
    if (assignment) return assignment[2];
  }
  const value = numberOf(apiValue);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}
function toService(raw: JsonObject, programs: ReturnType<typeof toProgram>[], now: number, channelType: string): TvService | null {
  const id = numberOf(raw.id);
  const serviceId = numberOf(raw.serviceId);
  const networkId = numberOf(raw.networkId);
  if (id === undefined || serviceId === undefined) return null;
  const remoconId = remoteControlKeyId(channelType, serviceId, raw.remoteControlKeyId);
  const matchingPrograms = programs.filter((program) => program && program.serviceId === serviceId && (networkId === undefined || program.networkId === undefined || program.networkId === networkId));
  const current = matchingPrograms
    .filter((program) => program && program.startAt <= now && program.startAt + program.duration > now)
    .sort((a, b) => (b?.startAt ?? 0) - (a?.startAt ?? 0))[0] ?? null;
  const next = matchingPrograms
    .filter((program) => program && program.startAt > now && (!current || program.startAt >= current.startAt + current.duration))
    .sort((a, b) => (a?.startAt ?? 0) - (b?.startAt ?? 0))[0] ?? null;
  const asUiProgram = (program: ReturnType<typeof toProgram>): TvProgram | null => program ? {
    ...(program.id === undefined ? {} : { id: program.id }),
    ...(program.name === undefined ? {} : { name: program.name }),
    ...(program.description === undefined ? {} : { description: program.description }),
    startAt: program.startAt,
    duration: program.duration,
  } : null;
  return {
    id,
    serviceId,
    ...(networkId === undefined ? {} : { networkId }),
    name: stringOf(raw.name) ?? `サービス ${id}`,
    ...(numberOf(raw.type) === undefined ? {} : { type: numberOf(raw.type) }),
    ...(remoconId === undefined ? {} : { remoteControlKeyId: remoconId }),
    channelType,
    isSubchannel: isSubchannel(channelType, serviceId),
    currentProgram: asUiProgram(current),
    nextProgram: asUiProgram(next),
  };
}

app.get('/api/config', async (_req, res) => res.json(await readConfig()));
app.put('/api/config', async (req, res) => {
  try {
    const mirakcUrl = normalizeUrl(req.body?.mirakcUrl);
    const response = await fetch(`${mirakcUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return res.status(502).json({ error: `接続先がHTTP ${response.status}を返しました` });
    const version = await response.json().catch(() => null);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ mirakcUrl }, null, 2), { mode: 0o600 });
    res.json({ mirakcUrl, version });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '接続できませんでした' });
  }
});
app.get('/api/tvhiroba/channels', async (_req, res) => {
  try {
    const [channelsResponse, servicesResponse, programsResponse] = await Promise.all([
      upstream('/api/channels'),
      upstream('/api/services').catch(() => null),
      upstream('/api/programs').catch(() => null),
    ]);
    if (!channelsResponse.ok) return res.status(channelsResponse.status).json({ error: `チャンネル一覧の取得に失敗しました (HTTP ${channelsResponse.status})` });
    const rawChannels = arrayOf(await channelsResponse.json());
    const rawServices = servicesResponse?.ok ? arrayOf(await servicesResponse.json()) : [];
    const serviceDetailsById = new Map(rawServices.map((service) => [numberOf(service.id), service]));
    const rawPrograms = programsResponse?.ok ? arrayOf(await programsResponse.json()) : [];
    const programs = rawPrograms.map(toProgram).filter((program): program is NonNullable<ReturnType<typeof toProgram>> => program !== null);
    const now = Date.now();
    const channels = rawChannels.map((rawChannel) => {
      const type = stringOf(rawChannel.type) ?? '';
      const channel = stringOf(rawChannel.channel) ?? '';
      const embedded = arrayOf(rawChannel.services);
      const fallback = rawServices.filter((service) => {
        const serviceChannel = objectOf(service.channel);
        return channelKey(serviceChannel?.type, serviceChannel?.channel) === channelKey(type, channel);
      });
      const serviceRecords = embedded.length > 0 ? embedded : fallback;
      const serviceById = new Map<number, TvService>();
      for (const rawService of serviceRecords) {
        const service = toService({ ...rawService, ...serviceDetailsById.get(numberOf(rawService.id)) }, programs, now, type);
        if (service && !serviceById.has(service.id)) serviceById.set(service.id, service);
      }
      return {
        type,
        channel,
        name: stringOf(rawChannel.name) ?? `${type} ${channel}`,
        services: [...serviceById.values()],
      };
    });
    const servicesWithGuide = channels.flatMap((item) => item.services).filter((service) => service.currentProgram || service.nextProgram).length;
    res.json({
      channels,
      programGuideAvailable: servicesWithGuide > 0,
      serviceCount: channels.reduce((count, item) => count + item.services.length, 0),
      servicesWithGuide,
      generatedAt: now,
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'チャンネル情報を取得できませんでした' });
  }
});
app.get('/api/services', async (_req, res) => {
  try {
    const response = await upstream('/api/services');
    if (!response.ok) return res.status(response.status).json({ error: `mirakcがHTTP ${response.status}を返しました` });
    res.type('application/json').send(await response.text());
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'サービス一覧を取得できませんでした' });
  }
});
app.get('/api/stream/:serviceId', streamProxy((serviceId, signal) =>
  upstream(`/api/services/${encodeURIComponent(serviceId)}/stream`, 0, signal)));

const distPath = path.resolve(root, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
app.listen(port, '0.0.0.0', () => console.log(`TVhiroba server listening on http://localhost:${port}`));
