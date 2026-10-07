import { VoiceNote, VoiceRef } from '../models/api.models';

/** A voice note we uploaded in this session (has a `path` to send back). */
export function isStoredVoice(v: VoiceNote | null | undefined): v is VoiceNote & { path: string } {
  return !!v && typeof v.path === 'string' && v.path.length > 0;
}

export function toVoiceRef(v: VoiceNote & { path: string }): VoiceRef {
  return { path: v.path, duration: v.duration, mime: v.mime, size: v.size };
}

/**
 * What to put in a request for a note's voice field:
 * a fresh upload sends its reference; removing a saved one sends `null`; anything else is left out (kept as is).
 */
export function voiceField(value: VoiceNote | null | undefined, hadSaved: boolean): { has: boolean; value: VoiceRef | null } {
  if (isStoredVoice(value)) return { has: true, value: toVoiceRef(value) };
  if (value === null && hadSaved) return { has: true, value: null };
  return { has: false, value: null };
}
