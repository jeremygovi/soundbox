import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  soundsDir: string;
  databasePath: string;
  migrationsDir: string;
  publicDir: string;
  maxSoundSizeBytes: number;
  importTimeoutMs: number;
  adminPassword: string;
  userPassword: string;
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} doit être un nombre strictement positif`);
  }
  return parsed;
}

function password(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} est obligatoire`);
  }
  return value;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.resolve('data');
  const config = {
    port: overrides.port ?? positiveNumber(process.env.PORT, 3000, 'PORT'),
    host: overrides.host ?? process.env.HOST ?? '0.0.0.0',
    dataDir,
    soundsDir: overrides.soundsDir ?? path.join(dataDir, 'sounds'),
    databasePath: overrides.databasePath ?? path.join(dataDir, 'soundbox.db'),
    migrationsDir: overrides.migrationsDir ?? process.env.MIGRATIONS_DIR ?? path.resolve('migrations'),
    publicDir: overrides.publicDir ?? process.env.PUBLIC_DIR ?? path.resolve('public'),
    maxSoundSizeBytes:
      overrides.maxSoundSizeBytes ??
      Math.floor(positiveNumber(process.env.MAX_SOUND_SIZE_MB, 10, 'MAX_SOUND_SIZE_MB') * 1024 * 1024),
    importTimeoutMs:
      overrides.importTimeoutMs ?? positiveNumber(process.env.IMPORT_TIMEOUT_MS, 10_000, 'IMPORT_TIMEOUT_MS'),
    adminPassword: overrides.adminPassword ?? password(process.env.ADMIN_PASSWORD, 'ADMIN_PASSWORD'),
    userPassword: overrides.userPassword ?? password(process.env.USER_PASSWORD, 'USER_PASSWORD')
  };
  if (config.adminPassword === config.userPassword) {
    throw new Error('ADMIN_PASSWORD et USER_PASSWORD doivent être différents');
  }
  return config;
}
