import { DEFAULT_COLORS } from './palette-defaults'
import type { ColorRole } from './types'

export interface ThemePreset {
  id: string
  name: string
  description: string
  colors: Record<ColorRole, string>
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'crimson-pulse',
    name: 'Crimson Pulse',
    description: 'Aesthetic red & punchy rose (Default)',
    colors: { ...DEFAULT_COLORS }
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    description: 'Electric cyan & vivid hot pink',
    colors: {
      lyric: '#00d2ff',
      highlight: '#ff007f',
      secondary: '#79ffe1'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: 'Synthwave purple & cool blue',
    colors: {
      lyric: '#7aa2f7',
      highlight: '#bb9af7',
      secondary: '#b4f9f8'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Soothing pastel lavender & pink',
    colors: {
      lyric: '#89b4fa',
      highlight: '#f38ba8',
      secondary: '#cdd6f4'
    }
  },
  {
    id: 'nordic-frost',
    name: 'Nordic Frost',
    description: 'Arctic cyan & glacial blue',
    colors: {
      lyric: '#88c0d0',
      highlight: '#81a1c1',
      secondary: '#e5e9f0'
    }
  },
  {
    id: 'emerald-glow',
    name: 'Emerald Glow',
    description: 'Lush forest jade & mint glow',
    colors: {
      lyric: '#10b981',
      highlight: '#059669',
      secondary: '#6ee7b7'
    }
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    description: 'Golden hour amber & dusk coral',
    colors: {
      lyric: '#f59e0b',
      highlight: '#ef4444',
      secondary: '#fde68a'
    }
  },
  {
    id: 'lavender-dream',
    name: 'Lavender Dream',
    description: 'Pastel purple & blush rose',
    colors: {
      lyric: '#c084fc',
      highlight: '#f43f5e',
      secondary: '#f3e8ff'
    }
  },
  {
    id: 'oled-monochrome',
    name: 'OLED Monochrome',
    description: 'Clean silver & pure bright white',
    colors: {
      lyric: '#8e8e93',
      highlight: '#ffffff',
      secondary: '#d1d1d6'
    }
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    description: 'Spotify neon green & bright chartreuse',
    colors: {
      lyric: '#1ed760',
      highlight: '#1db954',
      secondary: '#86efac'
    }
  }
]

export function matchPreset(colors: Record<ColorRole, string>): ThemePreset | null {
  const norm = (c: string): string => c.toLowerCase()
  return (
    THEME_PRESETS.find(
      (p) =>
        norm(p.colors.lyric) === norm(colors.lyric) &&
        norm(p.colors.highlight) === norm(colors.highlight) &&
        norm(p.colors.secondary) === norm(colors.secondary)
    ) ?? null
  )
}
