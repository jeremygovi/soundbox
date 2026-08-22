import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { cleanName, detectAudioFormat, isAllowedDeclaredMime, parseId, validColor } from '../services/audio.js';
import { downloadAudio } from '../services/importer.js';
import { inspectTempFile, persistSound, soundFilePath } from '../services/sounds.js';
import type { Sound } from '../types.js';

function soundResponse(sound: Sound): Omit<Sound, 'filename'> & { audio_url: string } {
  return {
    id: sound.id,
    profile_id: sound.profile_id,
    name: sound.name,
    original_filename: sound.original_filename,
    mime_type: sound.mime_type,
    size: sound.size,
    color: sound.color,
    position: sound.position,
    created_at: sound.created_at,
    audio_url: `/api/sounds/${sound.id}/audio`
  };
}

export function registerSoundRoutes(app: FastifyInstance, db: Database.Database, config: Config): void {
  app.get<{ Params: { id: string } }>('/api/profiles/:id/sounds', async (request) => {
    const profileId = parseId(request.params.id);
    if (!db.prepare('SELECT id FROM profiles WHERE id = ?').get(profileId)) throw new AppError('Profil introuvable', 404);
    const sounds = db.prepare('SELECT * FROM sounds WHERE profile_id = ? ORDER BY position, id').all(profileId) as Sound[];
    return sounds.map(soundResponse);
  });

  app.post<{ Params: { id: string } }>('/api/profiles/:id/sounds/upload', async (request, reply) => {
    const profileId = parseId(request.params.id);
    await mkdir(config.soundsDir, { recursive: true });
    const tempPath = path.join(config.soundsDir, `.${randomUUID()}.upload`);
    let uploaded = false;
    let originalFilename: string | null = null;
    let declaredMime = '';
    const fields: Record<string, string> = {};
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (uploaded) {
            part.file.resume();
            throw new AppError('Un seul fichier peut être envoyé');
          }
          uploaded = true;
          originalFilename = part.filename?.slice(0, 255) || null;
          declaredMime = part.mimetype;
          await pipeline(part.file, createWriteStream(tempPath, { flags: 'wx' }));
          if (part.file.truncated) throw new AppError('Le fichier dépasse la taille maximale', 413);
        } else if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value;
        }
      }
      if (!uploaded) throw new AppError('Fichier audio obligatoire');
      if (!isAllowedDeclaredMime(declaredMime)) throw new AppError('Type audio non accepté');
      const { bytes, size } = await inspectTempFile(tempPath);
      const format = detectAudioFormat(bytes);
      if (!format) throw new AppError("Le fichier n'est pas un MP3, WAV ou OGG valide");
      const name = cleanName(fields.name ?? originalFilename?.replace(/\.[^.]+$/, ''));
      const color = fields.color ?? 'red';
      if (!validColor(color)) throw new AppError('Couleur invalide');
      const sound = await persistSound(db, config.soundsDir, {
        profileId,
        name,
        originalFilename,
        color,
        format,
        tempPath,
        size
      });
      return reply.code(201).send(soundResponse(sound));
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  });

  app.post<{
    Params: { id: string };
    Body: { name?: unknown; url?: unknown; color?: unknown };
  }>('/api/profiles/:id/sounds/import', async (request, reply) => {
    const profileId = parseId(request.params.id);
    const name = cleanName(request.body?.name);
    const color = request.body?.color ?? 'red';
    if (!validColor(color)) throw new AppError('Couleur invalide');
    if (!db.prepare('SELECT id FROM profiles WHERE id = ?').get(profileId)) throw new AppError('Profil introuvable', 404);
    const downloaded = await downloadAudio(
      request.body?.url,
      config.maxSoundSizeBytes,
      config.importTimeoutMs
    );
    await mkdir(config.soundsDir, { recursive: true });
    const tempPath = path.join(config.soundsDir, `.${randomUUID()}.import`);
    try {
      await writeFile(tempPath, downloaded.data, { flag: 'wx' });
      const sound = await persistSound(db, config.soundsDir, {
        profileId,
        name,
        originalFilename: downloaded.originalFilename,
        color,
        format: downloaded.format,
        tempPath,
        size: downloaded.data.length
      });
      return reply.code(201).send(soundResponse(sound));
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: unknown; color?: unknown; position?: unknown };
  }>('/api/sounds/:id', async (request) => {
    const id = parseId(request.params.id);
    const current = db.prepare('SELECT * FROM sounds WHERE id = ?').get(id) as Sound | undefined;
    if (!current) throw new AppError('Son introuvable', 404);
    const name = request.body?.name === undefined ? current.name : cleanName(request.body.name);
    const color = request.body?.color === undefined ? current.color : request.body.color;
    const position = request.body?.position === undefined ? current.position : Number(request.body.position);
    if (!validColor(color)) throw new AppError('Couleur invalide');
    if (!Number.isSafeInteger(position) || position < 0) throw new AppError('Position invalide');
    db.prepare('UPDATE sounds SET name = ?, color = ?, position = ? WHERE id = ?').run(name, color, position, id);
    return soundResponse(db.prepare('SELECT * FROM sounds WHERE id = ?').get(id) as Sound);
  });

  app.delete<{ Params: { id: string } }>('/api/sounds/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const sound = db.prepare('SELECT * FROM sounds WHERE id = ?').get(id) as Sound | undefined;
    if (!sound) throw new AppError('Son introuvable', 404);
    await rm(soundFilePath(config.soundsDir, sound.filename), { force: true });
    db.prepare('DELETE FROM sounds WHERE id = ?').run(id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/sounds/:id/audio', async (request, reply) => {
    const id = parseId(request.params.id);
    const sound = db.prepare('SELECT * FROM sounds WHERE id = ?').get(id) as Sound | undefined;
    if (!sound) throw new AppError('Son introuvable', 404);
    const filePath = soundFilePath(config.soundsDir, sound.filename);
    let fileSize: number;
    try {
      fileSize = (await stat(filePath)).size;
    } catch {
      throw new AppError('Fichier audio introuvable', 404);
    }
    reply.header('Content-Type', sound.mime_type).header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, max-age=3600');
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return reply.code(416).header('Content-Range', `bytes */${fileSize}`).send();
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
      if (start > end || start >= fileSize) return reply.code(416).header('Content-Range', `bytes */${fileSize}`).send();
      return reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        .header('Content-Length', end - start + 1)
        .send(createReadStream(filePath, { start, end }));
    }
    return reply.header('Content-Length', fileSize).send(createReadStream(filePath));
  });
}
