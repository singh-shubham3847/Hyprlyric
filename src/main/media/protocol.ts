/** One Windows media session, as reported by `smtc-bridge.ps1`. Times are seconds, `updated` is epoch ms. */
export interface RawSession {
  app: string
  status: string
  title: string
  artist: string
  album: string
  pos: number
  start: number
  end: number
  /** Epoch ms when `pos` was true (SMTC `LastUpdatedTime`); may be invalid for some players. */
  updated: number
  rate: number
}

export type BridgeMessage =
  | { type: 'hello'; ps: string }
  | { type: 'sessions'; t: number; current: string | null; sessions: RawSession[] }
  | { type: 'art'; key: string; mime: string; data: string }
  | { type: 'error'; message: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function toSession(v: unknown): RawSession | null {
  if (!isRecord(v) || typeof v.app !== 'string' || !v.app) return null
  return {
    app: v.app,
    status: str(v.status) || 'Closed',
    title: str(v.title),
    artist: str(v.artist),
    album: str(v.album),
    pos: num(v.pos),
    start: num(v.start),
    end: num(v.end),
    updated: num(v.updated),
    rate: num(v.rate, 1)
  }
}

export function parseBridgeLine(line: string): BridgeMessage | null {
  const trimmed = line.replace(/^﻿/, '').trim()
  if (!trimmed.startsWith('{')) return null
  let v: unknown
  try {
    v = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!isRecord(v)) return null

  switch (v.type) {
    case 'hello':
      return { type: 'hello', ps: str(v.ps) }
    case 'sessions':
      return {
        type: 'sessions',
        t: num(v.t, Date.now()),
        current: typeof v.current === 'string' && v.current ? v.current : null,
        sessions: Array.isArray(v.sessions) ? v.sessions.map(toSession).filter((s): s is RawSession => s !== null) : []
      }
    case 'art':
      return typeof v.key === 'string' && typeof v.data === 'string' && v.data
        ? { type: 'art', key: v.key, mime: str(v.mime) || 'image/jpeg', data: v.data }
        : null
    case 'error':
      return { type: 'error', message: str(v.message) || 'unknown bridge error' }
    default:
      return null
  }
}

/** Identity of the track a session shows. Must match `$key` in smtc-bridge.ps1. */
export const rawKey = (s: Pick<RawSession, 'app' | 'title' | 'artist' | 'album'>): string =>
  `${s.app}|${s.title}|${s.artist}|${s.album}`
