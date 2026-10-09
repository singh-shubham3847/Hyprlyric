import type { TrackInfo } from '@shared/types'
import { splitAppleMusicArtist } from '../lyrics/normalize'
import { rawKey, type RawSession } from './protocol'

const DEFAULT_APPS = [/spotify/i, /AppleInc\.AppleMusic/i, /itunes/i]
const APPLE_MUSIC = /AppleInc\.AppleMusic/i

export function isAllowedApp(app: string, allPlayers: boolean): boolean {
  return allPlayers || DEFAULT_APPS.some((re) => re.test(app))
}

/**
 * Chooses the session to follow. Something playing beats something paused; among
 * those, Windows' own "current" session wins, then the track we were already following.
 */
export function selectSession(
  snapshot: { current: string | null; sessions: RawSession[] },
  prevKey: string | null,
  allPlayers: boolean
): RawSession | null {
  const allowed = snapshot.sessions.filter((s) => isAllowedApp(s.app, allPlayers))
  if (!allowed.length) return null

  const isCurrent = (s: RawSession): boolean => snapshot.current !== null && s.app === snapshot.current
  const isPrev = (s: RawSession): boolean => prevKey !== null && rawKey(s) === prevKey

  const playing = allowed.filter((s) => s.status === 'Playing')
  if (playing.length) return playing.find(isCurrent) ?? playing.find(isPrev) ?? playing[0]!
  return allowed.find(isPrev) ?? allowed.find(isCurrent) ?? allowed[0]!
}

export function toTrackInfo(s: RawSession): TrackInfo {
  const fields = APPLE_MUSIC.test(s.app) ? splitAppleMusicArtist(s.artist, s.album) : { artist: s.artist, album: s.album }
  return {
    key: rawKey(s),
    app: s.app,
    title: s.title.trim(),
    artist: fields.artist.trim(),
    album: fields.album.trim(),
    durationMs: Math.max(0, Math.round((s.end - s.start) * 1000))
  }
}
