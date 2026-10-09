import type { TrackInfo } from './types'

/**
 * An original demo song written for Hyprlyric (not a real track), used by snapshot mode and
 * tests to exercise every display style. Its words deliberately include many that have icons.
 */
export const DEMO_LRC = `[ar:Hyprlyric]
[ti:Neon Butterflies]
[00:01.00]Midnight city, every window burning
[00:04.60]I can see a fire in your eyes
[00:08.20]Rain across the road and hearts returning
[00:11.80]Drive until the moon forgets to rise
[00:15.40]Call me when the stars are falling slowly
[00:19.00]Dance beneath the neon butterflies
[00:23.00]
`

export const DEMO_TRACK: TrackInfo = {
  key: 'demo|Neon Butterflies|Hyprlyric|Demo',
  app: 'demo',
  title: 'Neon Butterflies',
  artist: 'Hyprlyric',
  album: 'Demo',
  durationMs: 26_000
}

/** Song times (ms) snapshot mode renders for each style. */
export const DEMO_MOMENTS = [5_900, 9_700, 16_600]
