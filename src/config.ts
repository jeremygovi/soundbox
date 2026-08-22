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
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} doit être un nombre strictement positif`);
  }
  return parsed;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.resolve('data');
  return {
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
      overrides.importTimeoutMs ?? positiveNumber(process.env.IMPORT_TIMEOUT_MS, 10_000, 'IMPORT_TIMEOUT_MS')
  };
}
