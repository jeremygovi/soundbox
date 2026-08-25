import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { rm } from 'node:fs/promises';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { cleanName, parseId } from '../services/audio.js';
import { soundFilePath } from '../services/sounds.js';
import type { Profile } from '../types.js';
import { requireAdmin } from '../auth.js';

export function registerProfileRoutes(app: FastifyInstance, db: Database.Database, config: Config): void {
  app.get('/api/profiles', async () =>
    db.prepare('SELECT * FROM profiles ORDER BY position, id').all() as Profile[]
  );

  app.post<{ Body: { name?: unknown } }>('/api/profiles', async (request, reply) => {
    requireAdmin(request);
    const name = cleanName(request.body?.name);
    const result = db.prepare(`
      INSERT INTO profiles (name, position, created_at)
      VALUES (?, COALESCE((SELECT MAX(position) + 1 FROM profiles), 0), ?)
    `).run(name, new Date().toISOString());
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(result.lastInsertRowid) as Profile;
    return reply.code(201).send(profile);
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown; position?: unknown } }>(
    '/api/profiles/:id',
    async (request) => {
      requireAdmin(request);
      const id = parseId(request.params.id);
      const current = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Profile | undefined;
      if (!current) throw new AppError('Profil introuvable', 404);
      const name = request.body?.name === undefined ? current.name : cleanName(request.body.name);
      const position = request.body?.position === undefined ? current.position : Number(request.body.position);
      if (!Number.isSafeInteger(position) || position < 0) throw new AppError('Position invalide');
      db.prepare('UPDATE profiles SET name = ?, position = ? WHERE id = ?').run(name, position, id);
      return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Profile;
    }
  );

  app.delete<{ Params: { id: string } }>('/api/profiles/:id', async (request, reply) => {
    requireAdmin(request);
    const id = parseId(request.params.id);
    const exists = db.prepare('SELECT id FROM profiles WHERE id = ?').get(id);
    if (!exists) throw new AppError('Profil introuvable', 404);
    const files = db.prepare('SELECT filename FROM sounds WHERE profile_id = ?').all(id) as { filename: string }[];
    await Promise.all(files.map(({ filename }) => rm(soundFilePath(config.soundsDir, filename), { force: true })));
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return reply.code(204).send();
  });
}
