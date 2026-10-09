import type { LyricsAppApi } from '../shared/ipc'

declare global {
  interface Window {
    lyricsApp: LyricsAppApi
  }
}

export {}
