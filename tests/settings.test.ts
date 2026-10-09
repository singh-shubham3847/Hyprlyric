import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore, sanitizeSettings } from '../src/main/settings'

const tempFile = (): string => join(mkdtempSync(join(tmpdir(), 'tal-settings-')), 'settings.json')

describe('sanitizeSettings', () => {
  it('returns defaults for missing or non-object input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
  })

  it('uses precise word timing by default and can turn it off', () => {
    expect(DEFAULT_SETTINGS.wordLevel).toBe(true)
    expect(sanitizeSettings({ wordLevel: false }).wordLevel).toBe(false)
    expect(sanitizeSettings({ wordLevel: 1 }).wordLevel).toBe(true)
  })

  it('does not lock Windows from the lyrics screen unless asked to', () => {
    expect(DEFAULT_SETTINGS.lockOnReturn).toBe(false)
    expect(sanitizeSettings({ lockOnReturn: 'yes' }).lockOnReturn).toBe(false)
  })

  it('enables ambient backdrop and now-playing HUD by default', () => {
    expect(DEFAULT_SETTINGS.ambientBackdrop).toBe(true)
    expect(DEFAULT_SETTINGS.nowPlayingHud).toBe(true)
    expect(sanitizeSettings({ ambientBackdrop: false }).ambientBackdrop).toBe(false)
    expect(sanitizeSettings({ nowPlayingHud: false }).nowPlayingHud).toBe(false)
    expect(sanitizeSettings({ ambientBackdrop: 'invalid', nowPlayingHud: 123 })).toMatchObject({
      ambientBackdrop: true,
      nowPlayingHud: true
    })
  })

  it('repairs each invalid field on its own', () => {
    const s = sanitizeSettings({
      style: 'x',
      offsetMs: 99999,
      colors: { lyric: 'red', highlight: '#00FF00' },
      idleMinutes: 3,
      showOn: 'always'
    })
    expect(s.style).toBe('tesseract')
    expect(s.offsetMs).toBe(1000)
    expect(s.colors.lyric).toBe(DEFAULT_SETTINGS.colors.lyric)
    expect(s.colors.highlight).toBe('#00ff00')
    expect(s.colors.secondary).toBe(DEFAULT_SETTINGS.colors.secondary)
    expect(s.idleMinutes).toBe(2)
    expect(s.showOn).toBe('always')
  })

  it('keeps valid values and rounds the offset', () => {
    const s = sanitizeSettings({
      style: 'fisheye-visual',
      showOn: 'lock',
      displayId: 42,
      autoSync: true,
      offsetMs: -250.4,
      idleMinutes: 0,
      allPlayers: true,
      launchAtLogin: true,
      welcomed: true,
      lockOnReturn: true
    })
    expect(s).toMatchObject({
      lockOnReturn: true,
      style: 'fisheye-visual',
      displayId: 42,
      autoSync: true,
      offsetMs: -250,
      idleMinutes: 0,
      allPlayers: true,
      launchAtLogin: true,
      welcomed: true
    })
  })
})

describe('SettingsStore', () => {
  it('persists updates across instances', () => {
    const file = tempFile()
    new SettingsStore(file).update({ style: 'visual', offsetMs: -250 })
    const reopened = new SettingsStore(file)
    expect(reopened.get().style).toBe('visual')
    expect(JSON.parse(readFileSync(file, 'utf8')).offsetMs).toBe(-250)
  })

  it('merges partial colour updates', () => {
    const store = new SettingsStore(tempFile())
    store.update({ colors: { ...store.get().colors, lyric: '#112233' } })
    expect(store.get().colors).toEqual({ ...DEFAULT_SETTINGS.colors, lyric: '#112233' })
  })

  it('notifies listeners and supports unsubscribe', () => {
    const store = new SettingsStore(tempFile())
    const listener = vi.fn()
    const off = store.onChange(listener)
    store.update({ autoSync: true })
    off()
    store.update({ autoSync: false })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0].autoSync).toBe(true)
  })

  it('falls back to defaults when the file is corrupt', () => {
    const file = tempFile()
    writeFileSync(file, '{not json', 'utf8')
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS)
  })
})
