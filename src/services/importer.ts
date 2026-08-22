import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { AppError } from '../errors.js';
import { detectAudioFormat, isAllowedDeclaredMime } from './audio.js';
import type { AudioFormat } from '../types.js';

export interface DownloadedAudio {
  data: Buffer;
  format: AudioFormat;
  originalFilename: string | null;
}

export function isPublicIp(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export function validateHttpsUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new AppError('URL invalide');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('URL invalide');
  }
  if (url.protocol !== 'https:') throw new AppError('Seules les URL HTTPS sont acceptées');
  if (url.username || url.password) throw new AppError("Les identifiants dans l'URL ne sont pas acceptés");
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: number }> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new AppError('Cette adresse réseau est interdite');
    return { address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 };
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError('Impossible de résoudre le serveur distant', 422);
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new AppError('Le serveur distant pointe vers une adresse réseau interdite');
  }
  return addresses[0]!;
}

function filenameFromUrl(url: URL): string | null {
  const segment = url.pathname.split('/').filter(Boolean).at(-1);
  if (!segment) return null;
  try {
    return decodeURIComponent(segment).slice(0, 255);
  } catch {
    return segment.slice(0, 255);
  }
}

async function fetchOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<{
  redirect?: URL;
  audio?: DownloadedAudio;
}> {
  const target = await resolvePublicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: 'https:',
        hostname: target.address,
        family: target.family,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        headers: {
          Host: url.host,
          Accept: 'audio/mpeg, audio/wav, audio/ogg',
          'User-Agent': 'Soundbox/1.0'
        },
        timeout: timeoutMs
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.resume();
          if (!location) return reject(new AppError('Redirection distante invalide', 422));
          try {
            return resolve({ redirect: validateHttpsUrl(new URL(location, url).toString()) });
          } catch (error) {
            return reject(error);
          }
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return reject(new AppError(`Le serveur distant a répondu ${status}`, 422));
        }
        const declaredType = String(response.headers['content-type'] ?? '');
        if (!isAllowedDeclaredMime(declaredType)) {
          response.resume();
          return reject(new AppError("Le serveur distant n'a pas renvoyé un type audio accepté", 422));
        }
        const declaredLength = Number(response.headers['content-length'] ?? 0);
        if (declaredLength > maxBytes) {
          response.resume();
          return reject(new AppError('Le fichier distant dépasse la taille maximale', 413));
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            response.destroy(new AppError('Le fichier distant dépasse la taille maximale', 413));
          } else {
            chunks.push(chunk);
          }
        });
        response.on('error', reject);
        response.on('end', () => {
          const data = Buffer.concat(chunks);
          const format = detectAudioFormat(data.subarray(0, 16));
          if (!format) return reject(new AppError("Le contenu distant n'est pas un fichier MP3, WAV ou OGG valide", 422));
          resolve({ audio: { data, format, originalFilename: filenameFromUrl(url) } });
        });
      }
    );
    req.on('timeout', () => req.destroy(new AppError("Le téléchargement distant a expiré", 504)));
    req.on('error', reject);
    req.end();
  });
}

export async function downloadAudio(
  rawUrl: unknown,
  maxBytes: number,
  timeoutMs: number,
  maxRedirects = 3
): Promise<DownloadedAudio> {
  let url = validateHttpsUrl(rawUrl);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const result = await fetchOnce(url, maxBytes, timeoutMs);
    if (result.audio) return result.audio;
    if (!result.redirect) throw new AppError('Réponse distante invalide', 422);
    if (redirects === maxRedirects) throw new AppError('Trop de redirections distantes', 422);
    url = result.redirect;
  }
  throw new AppError('Trop de redirections distantes', 422);
}
