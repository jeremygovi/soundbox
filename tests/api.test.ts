import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let directory: string;
let app: FastifyInstance;

function multipart(boundary: string, fields: Record<string, string>, file: Buffer): Buffer {
  const pieces: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`));
  pieces.push(file, Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(pieces);
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'soundbox-test-'));
  app = await buildApp(loadConfig({
    dataDir: directory,
    soundsDir: path.join(directory, 'sounds'),
    databasePath: path.join(directory, 'soundbox.db'),
    migrationsDir: path.resolve('migrations'),
    publicDir: path.resolve('public'),
    maxSoundSizeBytes: 1024 * 1024
  }));
});

afterEach(async () => {
  await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('API', () => {
  it('expose un healthcheck', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('gère le cycle de vie d’un profil et d’un son uploadé', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'Jeremy' } });
    expect(created.statusCode).toBe(201);
    const profile = created.json();

    const boundary = 'soundbox-test-boundary';
    const fakeMp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(128)]);
    const upload = await app.inject({
      method: 'POST',
      url: `/api/profiles/${profile.id}/sounds/upload`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, { name: 'Air Horn', color: 'orange' }, fakeMp3)
    });
    expect(upload.statusCode).toBe(201);
    const sound = upload.json();
    expect(sound).toMatchObject({ name: 'Air Horn', color: 'orange', mime_type: 'audio/mpeg' });
    expect(sound.filename).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: `/api/profiles/${profile.id}/sounds` });
    expect(list.json()).toHaveLength(1);

    const audio = await app.inject({ method: 'GET', url: sound.audio_url });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect(audio.rawPayload).toEqual(fakeMp3);

    const updated = await app.inject({ method: 'PATCH', url: `/api/sounds/${sound.id}`, payload: { name: 'Horn', color: 'blue' } });
    expect(updated.json()).toMatchObject({ name: 'Horn', color: 'blue' });

    expect((await app.inject({ method: 'DELETE', url: `/api/sounds/${sound.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: sound.audio_url })).statusCode).toBe(404);
  });

  it('supprime aussi les fichiers avec leur profil', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'Alice' } });
    const profile = created.json();
    const boundary = 'delete-profile-boundary';
    const upload = await app.inject({
      method: 'POST', url: `/api/profiles/${profile.id}/sounds/upload`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, { name: 'Wow', color: 'pink' }, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32)]))
    });
    expect(upload.statusCode).toBe(201);
    expect((await app.inject({ method: 'DELETE', url: `/api/profiles/${profile.id}` })).statusCode).toBe(204);
    const files = await readFile(path.join(directory, 'soundbox.db'));
    expect(files.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${profile.id}/sounds` })).statusCode).toBe(404);
  });
});
