import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import { AppError } from './errors.js';

export type UserRole = 'admin' | 'user';

declare module 'fastify' {
  interface FastifyRequest {
    userRole: UserRole | null;
  }
}

const COOKIE_NAME = 'soundbox_session';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 60_000;
const MAX_LOGIN_FAILURES = 10;

interface Session {
  role: UserRole;
  expiresAt: number;
}

interface LoginAttempt {
  failures: number;
  resetAt: number;
}

function passwordMatches(candidate: string, expected: string): boolean {
  const candidateHash = createHash('sha256').update(candidate).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function sessionCookie(token: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function expiredSessionCookie(secure: boolean): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function usesHttps(request: FastifyRequest): boolean {
  return request.protocol === 'https' || request.headers['x-forwarded-proto'] === 'https';
}

export function requireAdmin(request: FastifyRequest): void {
  if (request.userRole !== 'admin') {
    throw new AppError('Cette action est réservée à l’administrateur', 403);
  }
}

export function registerAuth(app: FastifyInstance, config: Config): void {
  const sessions = new Map<string, Session>();
  const attempts = new Map<string, LoginAttempt>();

  app.decorateRequest('userRole', null);

  app.post<{ Body: { password?: unknown } }>('/api/auth/login', async (request, reply) => {
    const now = Date.now();
    const currentAttempt = attempts.get(request.ip);
    const attempt = currentAttempt && currentAttempt.resetAt > now
      ? currentAttempt
      : { failures: 0, resetAt: now + LOGIN_WINDOW_MS };

    if (attempt.failures >= MAX_LOGIN_FAILURES) {
      const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - now) / 1000));
      return reply.header('Retry-After', retryAfter).code(429).send({
        error: `Trop de tentatives. Réessayez dans ${retryAfter} secondes.`
      });
    }

    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const role = passwordMatches(password, config.adminPassword)
      ? 'admin'
      : passwordMatches(password, config.userPassword) ? 'user' : null;

    if (!role) {
      attempt.failures += 1;
      attempts.set(request.ip, attempt);
      throw new AppError('Mot de passe incorrect', 401);
    }

    attempts.delete(request.ip);
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { role, expiresAt: now + SESSION_DURATION_SECONDS * 1000 });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', sessionCookie(token, usesHttps(request)))
      .send({ role });
  });

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/') || request.routeOptions.url === '/api/auth/login') return;
    const token = cookieValue(request.headers.cookie, COOKIE_NAME);
    const session = token ? sessions.get(token) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      throw new AppError('Authentification requise', 401);
    }
    request.userRole = session.role;
  });

  app.get('/api/auth/session', async (request, reply) =>
    reply.header('Cache-Control', 'no-store').send({ role: request.userRole })
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = cookieValue(request.headers.cookie, COOKIE_NAME);
    if (token) sessions.delete(token);
    return reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', expiredSessionCookie(usesHttps(request)))
      .code(204)
      .send();
  });
}
