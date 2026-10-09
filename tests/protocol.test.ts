import { describe, expect, it } from 'vitest'
import { parseBridgeLine, rawKey, type RawSession } from '../src/main/media/protocol'

const session: RawSession = {
  app: 'Spotify.exe',
  status: 'Playing',
  title: 'Paper Lanterns',
  artist: 'Lantern Test Band',
  album: 'Fixtures',
  pos: 12.5,
  start: 0,
  end: 32,
  updated: 1_700_000_000_000,
  rate: 1
}

describe('parseBridgeLine', () => {
  it('accepts every message type', () => {
    expect(parseBridgeLine('{"type":"hello","ps":"5.1"}')).toEqual({ type: 'hello', ps: '5.1' })
    expect(parseBridgeLine(JSON.stringify({ type: 'sessions', t: 5, current: 'Spotify.exe', sessions: [session] }))).toEqual({
      type: 'sessions',
      t: 5,
      current: 'Spotify.exe',
      sessions: [session]
    })
    expect(parseBridgeLine('{"type":"art","key":"k","mime":"image/jpeg","data":"AAAA"}')).toMatchObject({ type: 'art', key: 'k' })
    expect(parseBridgeLine('{"type":"error","message":"boom"}')).toEqual({ type: 'error', message: 'boom' })
  })

  it('rejects junk, unknown types and malformed sessions', () => {
    expect(parseBridgeLine('')).toBeNull()
    expect(parseBridgeLine('not json')).toBeNull()
    expect(parseBridgeLine('{"type":"nope"}')).toBeNull()
    expect(parseBridgeLine('{"type":"sessions","t":1,"current":null,"sessions":[{"app":1}]}')).toEqual({
      type: 'sessions',
      t: 1,
      current: null,
      sessions: []
    })
  })

  it('fills missing optional fields with safe defaults', () => {
    const msg = parseBridgeLine('{"type":"sessions","t":1,"current":null,"sessions":[{"app":"X","status":"Paused","title":null}]}')
    expect(msg?.type === 'sessions' && msg.sessions[0]).toMatchObject({ app: 'X', title: '', pos: 0, end: 0, rate: 1 })
  })

  it('tolerates a byte-order mark and surrounding whitespace', () => {
    expect(parseBridgeLine('﻿ {"type":"hello","ps":"5.1"} ')).toEqual({ type: 'hello', ps: '5.1' })
  })
})

describe('rawKey', () => {
  it('joins the identity fields exactly like the bridge script', () => {
    expect(rawKey(session)).toBe('Spotify.exe|Paper Lanterns|Lantern Test Band|Fixtures')
  })
})
