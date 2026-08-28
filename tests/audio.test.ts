import { describe, expect, it } from 'vitest';
import { detectAudioFormat, validColor, validStyle } from '../src/services/audio.js';
import { isPublicIp, validateHttpsUrl } from '../src/services/importer.js';

describe('validation audio', () => {
  it('détecte les signatures prises en charge', () => {
    expect(detectAudioFormat(Buffer.from('49443304000000000000', 'hex'))?.extension).toBe('mp3');
    expect(detectAudioFormat(Buffer.from('fffbe000', 'hex'))?.extension).toBe('mp3');
    expect(detectAudioFormat(Buffer.from('524946460000000057415645', 'hex'))?.extension).toBe('wav');
    expect(detectAudioFormat(Buffer.from('4f6767530000000000000000', 'hex'))?.extension).toBe('ogg');
    expect(detectAudioFormat(Buffer.from('not audio'))).toBeNull();
  });

  it('limite les couleurs à la palette', () => {
    expect(validColor('mint')).toBe(true);
    expect(validColor('#ffffff')).toBe(false);
  });

  it('limite les styles aux variantes proposées', () => {
    expect(validStyle('arcade')).toBe(true);
    expect(validStyle('neon')).toBe(true);
    expect(validStyle('glass')).toBe(false);
  });
});

describe('protection SSRF', () => {
  it.each(['127.0.0.1', '10.0.0.4', '172.20.1.1', '192.168.1.1', '169.254.2.2', '::1', 'fc00::1'])(
    'refuse %s',
    (address) => expect(isPublicIp(address)).toBe(false)
  );

  it('accepte les adresses publiques', () => {
    expect(isPublicIp('1.1.1.1')).toBe(true);
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
  });

  it('impose HTTPS et refuse les credentials', () => {
    expect(() => validateHttpsUrl('http://example.com/a.mp3')).toThrow(/HTTPS/);
    expect(() => validateHttpsUrl('https://user:pass@example.com/a.mp3')).toThrow(/identifiants/);
    expect(validateHttpsUrl('https://example.com/a.mp3').hostname).toBe('example.com');
  });
});
