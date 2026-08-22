import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import type { Config } from './config.js';
import { openDatabase } from './database/database.js';
import { AppError } from './errors.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerSoundRoutes } from './routes/sounds.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  mkdirSync(config.soundsDir, { recursive: true });
  const db = openDatabase(config.databasePath, config.migrationsDir);
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await app.register(multipart, {
    limits: { fileSize: config.maxSoundSizeBytes, files: 1, fields: 10, parts: 11 }
  });
  await app.register(fastifyStatic, { root: config.publicDir, prefix: '/' });

  app.get('/health', async () => {
    db.prepare('SELECT 1').get();
    mkdirSync(config.soundsDir, { recursive: true });
    return { status: 'ok' };
  });

  registerProfileRoutes(app, db, config);
  registerSoundRoutes(app, db, config);

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Route introuvable' });
    return reply.sendFile('index.html');
  });

  app.setErrorHandler((error, request, reply) => {
    const safeError = error instanceof Error ? error : new Error('Erreur inconnue');
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const multipartError = errorCode.startsWith('FST_REQ_FILE_TOO_LARGE');
    const statusCode = multipartError ? 413 : safeError instanceof AppError ? safeError.statusCode : 500;
    if (statusCode >= 500) request.log.error(safeError);
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Erreur interne du serveur' : safeError.message
    });
  });

  app.addHook('onClose', async () => db.close());
  return app;
}
