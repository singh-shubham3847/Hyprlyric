import { describe, expect, it } from 'vitest'
import type { RawSession } from '../src/main/media/protocol'
import { isAllowedApp, selectSession, toTrackInfo } from '../src/main/media/select'

const s = (app: string, status: string, title = 'Song'): RawSession => ({
  app,
  status,
  title,
  artist: 'Artist',
  album: 'Album',
  pos: 0,
  start: 0,
  end: 200,
  updated: 0,
  rate: 1
})

const SPOTIFY = 'Spotify.exe'
const APPLE = 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App'
const CHROME = 'Chrome'

describe('isAllowedApp', () => {
  it('allows Spotify (desktop and Store) and Apple Music by default', () => {
    expect(isAllowedApp(SPOTIFY, false)).toBe(true)
    expect(isAllowedApp('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', false)).toBe(true)
    expect(isAllowedApp(APPLE, false)).toBe(true)
    expect(isAllowedApp(CHROME, false)).toBe(false)
    expect(isAllowedApp(CHROME, true)).toBe(true)
  })
})

describe('selectSession', () => {
  it('follows the current session when it is allowed', () => {
    const spotify = s(SPOTIFY, 'Playing')
    expect(selectSession({ current: SPOTIFY, sessions: [s(APPLE, 'Paused'), spotify] }, null, false)).toBe(spotify)
  })

  it('skips a disallowed current session in favour of a playing allowed one', () => {
    const spotify = s(SPOTIFY, 'Playing')
    expect(selectSession({ current: CHROME, sessions: [s(CHROME, 'Playing'), spotify] }, null, false)).toBe(spotify)
  })

  it('follows other players when allowed', () => {
    const chrome = s(CHROME, 'Playing')
    expect(selectSession({ current: CHROME, sessions: [chrome] }, null, true)).toBe(chrome)
  })

  it('prefers anything playing over a paused current session', () => {
    const apple = s(APPLE, 'Playing')
    expect(selectSession({ current: SPOTIFY, sessions: [s(SPOTIFY, 'Paused'), apple] }, null, false)).toBe(apple)
  })

  it('keeps the previously followed track while everything is paused', () => {
    const spotify = s(SPOTIFY, 'Paused', 'Old')
    const prevKey = `${SPOTIFY}|Old|Artist|Album`
    expect(selectSession({ current: APPLE, sessions: [spotify, s(APPLE, 'Paused')] }, prevKey, false)).toBe(spotify)
  })

  it('returns null when nothing allowed is present', () => {
    expect(selectSession({ current: CHROME, sessions: [s(CHROME, 'Playing')] }, null, false)).toBeNull()
    expect(selectSession({ current: null, sessions: [] }, null, true)).toBeNull()
  })
})

describe('toTrackInfo', () => {
  it('splits Apple Music "Artist — Album" and computes the duration', () => {
    const info = toTrackInfo({ ...s(APPLE, 'Playing'), artist: 'Some Artist — Some Album', album: '', start: 0, end: 215.4 })
    expect(info).toMatchObject({ app: APPLE, artist: 'Some Artist', album: 'Some Album', durationMs: 215_400 })
  })

  it('leaves other players alone and trims whitespace', () => {
    const info = toTrackInfo({ ...s(SPOTIFY, 'Playing', '  Song  '), artist: 'A — B', album: '' })
    expect(info).toMatchObject({ title: 'Song', artist: 'A — B', album: '' })
    expect(info.key).toBe(`${SPOTIFY}|  Song  |A — B|`)
  })

  it('reports zero duration when the player gives none', () => {
    expect(toTrackInfo({ ...s(SPOTIFY, 'Playing'), end: 0 }).durationMs).toBe(0)
  })
})
