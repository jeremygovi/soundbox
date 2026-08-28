export const SOUND_COLORS = [
  'red', 'coral', 'orange', 'yellow', 'green', 'mint',
  'cyan', 'blue', 'indigo', 'purple', 'pink', 'white'
] as const;
export type SoundColor = (typeof SOUND_COLORS)[number];

export const SOUND_STYLES = ['arcade', 'neon', 'flat', 'vinyl', 'wave', 'glass'] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export interface Profile {
  id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface Sound {
  id: number;
  profile_id: number;
  name: string;
  filename: string;
  original_filename: string | null;
  mime_type: string;
  size: number;
  color: SoundColor;
  style: SoundStyle;
  position: number;
  created_at: string;
}

export interface AudioFormat {
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/ogg';
  extension: 'mp3' | 'wav' | 'ogg';
}
