import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let directory: string;
let app: FastifyInstance;
const ADMIN_PASSWORD = 'admin-test-password';
const USER_PASSWORD = 'user-test-password';

async function login(password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password } });
  expect(response.statusCode).toBe(200);
  return response.headers['set-cookie']!.split(';', 1)[0];
}

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
    maxSoundSizeBytes: 1024 * 1024,
    adminPassword: ADMIN_PASSWORD,
    userPassword: USER_PASSWORD
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
    const cookie = await login(ADMIN_PASSWORD);
    const auth = { cookie };
    const created = await app.inject({ method: 'POST', url: '/api/profiles', headers: auth, payload: { name: 'Jeremy' } });
    expect(created.statusCode).toBe(201);
    const profile = created.json();

    const boundary = 'soundbox-test-boundary';
    const fakeMp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(128)]);
    const upload = await app.inject({
      method: 'POST',
      url: `/api/profiles/${profile.id}/sounds/upload`,
      headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, { name: 'Air Horn', color: 'coral', style: 'neon' }, fakeMp3)
    });
    expect(upload.statusCode).toBe(201);
    const sound = upload.json();
    expect(sound).toMatchObject({ name: 'Air Horn', color: 'coral', style: 'neon', mime_type: 'audio/mpeg' });
    expect(sound.filename).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: `/api/profiles/${profile.id}/sounds`, headers: auth });
    expect(list.json()).toHaveLength(1);

    const audio = await app.inject({ method: 'GET', url: sound.audio_url, headers: auth });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect(audio.rawPayload).toEqual(fakeMp3);

    const updated = await app.inject({ method: 'PATCH', url: `/api/sounds/${sound.id}`, headers: auth, payload: { name: 'Horn', color: 'white', style: 'flat' } });
    expect(updated.json()).toMatchObject({ name: 'Horn', color: 'white', style: 'flat' });

    expect((await app.inject({ method: 'DELETE', url: `/api/sounds/${sound.id}`, headers: auth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: sound.audio_url, headers: auth })).statusCode).toBe(404);
  });

  it('supprime aussi les fichiers avec leur profil', async () => {
    const cookie = await login(ADMIN_PASSWORD);
    const auth = { cookie };
    const created = await app.inject({ method: 'POST', url: '/api/profiles', headers: auth, payload: { name: 'Alice' } });
    const profile = created.json();
    const boundary = 'delete-profile-boundary';
    const upload = await app.inject({
      method: 'POST', url: `/api/profiles/${profile.id}/sounds/upload`,
      headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, { name: 'Wow', color: 'pink' }, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32)]))
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({ style: 'arcade' });
    expect((await app.inject({ method: 'DELETE', url: `/api/profiles/${profile.id}`, headers: auth })).statusCode).toBe(204);
    const files = await readFile(path.join(directory, 'soundbox.db'));
    expect(files.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${profile.id}/sounds`, headers: auth })).statusCode).toBe(404);
  });

  it('demande une session et refuse un mauvais mot de passe', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/profiles' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'incorrect-password' } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Mot de passe incorrect' });
  });

  it('réserve la gestion des profils à l’admin', async () => {
    const userCookie = await login(USER_PASSWORD);
    expect((await app.inject({
      method: 'POST', url: '/api/profiles', headers: { cookie: userCookie }, payload: { name: 'Interdit' }
    })).statusCode).toBe(403);

    const adminCookie = await login(ADMIN_PASSWORD);
    const created = await app.inject({
      method: 'POST', url: '/api/profiles', headers: { cookie: adminCookie }, payload: { name: 'Autorisé' }
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/profiles', headers: { cookie: userCookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const profile = created.json();
    const boundary = 'user-sound-boundary';
    const upload = await app.inject({
      method: 'POST',
      url: `/api/profiles/${profile.id}/sounds/upload`,
      headers: { cookie: userCookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, { name: 'Son utilisateur', color: 'cyan' }, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32)]))
    });
    expect(upload.statusCode).toBe(201);
    const sound = upload.json();
    expect((await app.inject({
      method: 'PATCH', url: `/api/sounds/${sound.id}`, headers: { cookie: userCookie }, payload: { name: 'Modifié' }
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'DELETE', url: `/api/sounds/${sound.id}`, headers: { cookie: userCookie }
    })).statusCode).toBe(204);
  });

  it('invalide la session à la déconnexion', async () => {
    const cookie = await login(USER_PASSWORD);
    expect((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).json()).toEqual({ role: 'user' });
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/profiles', headers: { cookie } })).statusCode).toBe(401);
  });
});
