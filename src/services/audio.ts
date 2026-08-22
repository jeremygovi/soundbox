import { SOUND_COLORS, type AudioFormat, type SoundColor } from '../types.js';

const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'application/ogg'
]);

export function isAllowedDeclaredMime(value: string): boolean {
  return ALLOWED_MIME_TYPES.has(value.split(';', 1)[0]!.trim().toLowerCase());
}

export function detectAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length >= 12) {
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mimeType: 'audio/wav', extension: 'wav' };
    if (ascii(0, 4) === 'OggS') return { mimeType: 'audio/ogg', extension: 'ogg' };
  }
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  return null;
}

export function validColor(value: unknown): value is SoundColor {
  return typeof value === 'string' && (SOUND_COLORS as readonly string[]).includes(value);
}

export function cleanName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string') throw new Error(`${field} est obligatoire`);
  const result = value.trim();
  if (!result || result.length > 80) throw new Error(`${field} doit contenir entre 1 et 80 caractères`);
  return result;
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identifiant invalide');
  return id;
}
