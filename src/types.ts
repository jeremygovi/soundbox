export const SOUND_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type SoundColor = (typeof SOUND_COLORS)[number];

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
  position: number;
  created_at: string;
}

export interface AudioFormat {
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/ogg';
  extension: 'mp3' | 'wav' | 'ogg';
}
