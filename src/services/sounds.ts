import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AudioFormat, Sound, SoundColor } from '../types.js';

interface NewSound {
  profileId: number;
  name: string;
  originalFilename: string | null;
  color: SoundColor;
  format: AudioFormat;
  tempPath: string;
  size: number;
}

export function soundFilename(extension: AudioFormat['extension']): string {
  return `${randomUUID()}.${extension}`;
}

export function soundFilePath(soundsDir: string, filename: string): string {
  return path.join(soundsDir, path.basename(filename));
}

export async function persistSound(db: Database.Database, soundsDir: string, input: NewSound): Promise<Sound> {
  const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(input.profileId);
  if (!profile) throw new Error('Profil introuvable');
  await mkdir(soundsDir, { recursive: true });
  const filename = soundFilename(input.format.extension);
  const finalPath = soundFilePath(soundsDir, filename);
  await rename(input.tempPath, finalPath);
  try {
    const result = db.prepare(`
      INSERT INTO sounds (profile_id, name, filename, original_filename, mime_type, size, color, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM sounds WHERE profile_id = ?), 0), ?)
    `).run(
      input.profileId,
      input.name,
      filename,
      input.originalFilename,
      input.format.mimeType,
      input.size,
      input.color,
      input.profileId,
      new Date().toISOString()
    );
    return db.prepare('SELECT * FROM sounds WHERE id = ?').get(result.lastInsertRowid) as Sound;
  } catch (error) {
    await rm(finalPath, { force: true });
    throw error;
  }
}

export async function inspectTempFile(tempPath: string): Promise<{ bytes: Buffer; size: number }> {
  const info = await stat(tempPath);
  const handle = await readFile(tempPath);
  return { bytes: handle.subarray(0, 16), size: info.size };
}
