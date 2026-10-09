# Wordlit — design spec

> **Historical document.** The app was codenamed **Wordlit** while it was designed and built, and shipped as **Hyprlyric**. Names, paths and `WORDLIT_*` variables below use the old codename.

**Date:** 2026-09-23
**Status:** Approved (stack, lock behaviour, lyrics source and name chosen by the user)

## 1. What we are building

Wordlit is a Windows tray app that recreates the Mac app from verci.xyz. It shows the lyrics of whatever Spotify or Apple Music is playing. Each word lights up at the moment it is sung, in one of four animated styles, on a full-screen "lock-style" screen or as an overlay that stays up all the time.

| Verci (macOS) | Wordlit (Windows) |
|---|---|
| Menu bar app, no dock icon, no window | Tray app, no taskbar button, no main window |
| Now Playing from Spotify / Apple Music | Windows media sessions API (SMTC); Spotify + Apple Music by default, other players optional |
| Word-level lyrics from a third-party source | LRCLIB: exact line timing. Word timing is estimated inside each line, or taken from the source when it has real word tags |
| Four styles: Ship, Fisheye, Fisheye Visual, Visual | Same four, drawn with CSS 3D and a WebGL lens shader |
| Three colours or Auto Sync from album art | Same. Defaults are sampled from Verci's Ship style |
| Lyrics on the lock screen, or always | Windows can't draw on the lock screen, so we use the **Hybrid** approach below |
| Keeps the display awake while playing | `powerSaveBlocker('prevent-display-sleep')` while a track with lyrics is playing |
| Display picker | Same (choose which monitor) |

### Hybrid lock mode (the user's choice)
- **Ctrl+Alt+L** (or tray "Show Lyrics Now") opens the full-screen lyrics screen. It shows a clock and date, like the Windows lock screen. When the user comes back and touches anything, the screen closes and **Windows locks** (`LockWorkStation`), so a PIN is required, as on the Mac.
- **Idle trigger:** after N minutes with no input (default 2, can be set to Off) while a track with lyrics is playing, the same screen appears. Any input just closes it. It does **not** lock.
- A 1.2 s grace period after opening stops the key release from closing the screen straight away.

### "Always" mode
A transparent, click-through, always-on-top overlay across the chosen display. It is visible while a track with lyrics plays and hides 3 s after pause or stop.

## 2. Architecture

```
┌──────────────────────── Electron main (Node) ────────────────────────┐
│ MediaWatcher ── spawns ──▶ powershell.exe smtc-bridge.ps1 (WinRT)     │
│   │ JSON lines: sessions snapshot / artwork / errors                  │
│   ▼                                                                   │
│ AppController ──▶ LyricsService (local .lrc → cache → LRCLIB)         │
│   │            ──▶ PaletteService (album art → 3 colours)             │
│   │            ──▶ StageController (lock/always windows, idle, hotkey)│
│   │            ──▶ PowerKeeper, TrayMenu, ColorsWindow, Settings      │
└───┼───────────────────────────────────────────────────────────────────┘
    │ IPC (contextBridge, sandboxed preload)
┌───▼──────────── Renderer: stage.html ─────────────┐  ┌─ colors.html ─┐
│ Clock (extrapolate + smooth + offset)             │  │ 3 colour wells │
│ Styles: Ship │ Fisheye │ Fisheye Visual │ Visual  │  │ Auto Sync,Reset│
│ Icon resolver (word → Fluent icon / emoji)        │  └────────────────┘
└───────────────────────────────────────────────────┘
```

### 2.1 Now playing: `resources/smtc-bridge.ps1` + `src/main/media/*`
- Run with Windows PowerShell 5.1 (`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File …`, `windowsHide`), which ships with Windows 10/11. It uses WinRT `GlobalSystemMediaTransportControlsSessionManager`, so no .NET SDK is needed. It connected in 63 ms on the target PC.
- Polls every 250 ms. It emits a `sessions` snapshot when something changes, plus a heartbeat every 2 s. Each session includes app id, status, title, artist, album, `pos` (s), `end` (s) and `updated` (epoch ms of `LastUpdatedTime`). An `art` message (base64) is sent once per track.
- UTF-8 stdout, so non-English titles survive. It checks every 2 s that the parent process is alive and exits if it's gone.
- Node side: parse and validate lines, then pick the followed session:
  1. The OS "current" session, if its app is allowed.
  2. Otherwise the first allowed session that is playing.
  3. Otherwise the last session followed.
- Allowed apps are Spotify (desktop and Store) and Apple Music. Setting `allPlayers` allows any app.
- Apple Music quirk: its artist field reads `Artist — Album`. We split it when the album field is empty.
- Position is `pos + (now − updated)` while playing. If `updated` looks invalid (≤ 0, in the future, or stale while `pos` keeps moving), we use the time we sampled it instead.
- If the bridge crashes, it restarts with backoff (1 s → 30 s). A failure shows as a status line in the tray.

### 2.2 Lyrics: `src/main/lyrics/*`
- Lookup order:
  1. The local folder `Documents\Wordlit\Lyrics\<Artist> - <Title>.lrc`
  2. The disk cache (`userData/lyrics-cache`)
  3. LRCLIB `/api/get` (title, artist, album, duration)
  4. LRCLIB `/api/search`, with scoring on title, artist, duration and whether synced lyrics exist
  5. A search with the title normalised (dropping `feat.`, `- Remastered…` and similar)
- Requests send the header `User-Agent: Wordlit/<ver>`, time out after 8 s, and retry 3 times on 429/5xx/network errors (the API answered `503 ServerOverloaded` during research). Not-found results are cached for 3 days. Errors are not cached.
- Parsing prefers the `lyricsfile` YAML, because it has `start_ms` **and** `end_ms`, so the last word never stretches across an instrumental break. Otherwise we fall back to `syncedLyrics` LRC. The LRC parser handles:
  - several time tags on one line
  - `[offset:]`
  - `mm:ss:xx` times
  - blank "break" lines
  - A2 enhanced `<mm:ss.xx>` word tags, which give real word timing
- Word timing estimate: each word's share of the line is weighted by syllables, and punctuation adds a hold. A line whose end was inferred is capped, so gaps aren't absorbed. CJK text is split into characters.
- Result model: `TimedLyrics { lines: { start, end, text, words: { text, start, end }[] }[], wordTiming: 'native' | 'estimated' }`, with times in ms.
- Songs with no synced lyrics, or instrumental tracks, show nothing (matching Verci).

### 2.3 Palette: `src/main/palette/*`
- Default colours from the Verci screenshot:
  - lyric `#DC372A`
  - highlight `#CA415E`, with near-white text `#FFF1F3`
  - secondary `#E7B9C2`, shown at reduced opacity for upcoming words
- **Auto Sync:** decode the album art with `nativeImage.toBitmap()`, downsample, then k-means in OKLab. Assign the roles lyric, highlight and secondary, then enforce readability: lyric contrast ≥ 4.5 : 1 on black, and white text ≥ 3 : 1 on the highlight. Artwork that is nearly greyscale falls back to the defaults.

### 2.4 Stage renderer: `src/renderer/*`
- **Clock:** takes playback anchors and extrapolates with `performance.now()`. It slews through small corrections (< 250 ms) over 300 ms and jumps on seeks. The user timing offset is applied here.
- **Ship (the look in the user's screenshot):**
  - One word per row in a CSS-3D "wall" (`perspective`, `preserve-3d`).
  - Function words are small and content words big.
  - The current word sits in a highlight box with near-white text and pops forward.
  - Sung words turn the lyric colour, recede in Z with depth fog, and scroll up.
  - The next 1–2 words wait faintly behind and below in the secondary colour.
  - The whole wall drifts slowly in 3D (low-frequency rotateX/Y).
- **Fisheye:** a word stack drawn to a 2D canvas, uploaded as a WebGL texture, and passed through a convex-lens fragment shader. It adds dome magnification at the centre, compression at the rim, slight chromatic aberration, a vignette and a specular glint. The current word sits at the centre ("closest to the glass").
- **Fisheye Visual:** Fisheye with icons drawn beside the words.
- **Visual:** the current line is laid out centred. Each word pops in as it is sung, and mapped words get an icon that pops in beside them. The icon is a Fluent UI System Icon (MIT, the Windows counterpart to SF Symbols) tinted with the highlight colour, or a Segoe UI Emoji. About 770 curated words are mapped, and a lemmatiser also covers plurals and verb forms.
- **Font:** Inter Variable, bundled offline through `@fontsource-variable/inter`.
- **Lock mode adds** a clock and date at the top and hides the cursor. **Always mode adds** a soft text shadow for legibility on top of other content.

### 2.5 Tray menu (native, mirrors Verci's dropdown)
```
Wordlit
<Title — Artist> | Nothing playing | Searching lyrics… | No lyrics for this song
─────────
Display ▸ (monitors)            Style ▸ Ship/Fisheye/Fisheye Visual/Visual
Show On ▸ Lock Screen/Always    Show Lyrics Now   Ctrl+Alt+L
─────────
Color: ✓ Auto Sync, ■ Lyric Text…, ■ Highlight…, ■ Secondary Text…, Reset Colors
─────────
Timing ▸ (−0.5 … +0.5 s)   Idle ▸ (1/2/5 min, Off)   Players ▸ (Spotify & Apple Music / + other apps)
Open Lyrics Folder   Start with Windows (packaged only)   Quit Wordlit
```
Colour items open a small Colors window: three `<input type=color>` wells with hex readouts, an Auto Sync toggle and Reset. Picking a colour turns Auto Sync off.

### 2.6 Settings, logging, safety
- `userData/settings.json` is written atomically and every field is validated with defaults. The `WORDLIT_PROFILE` env var redirects userData, which tests use.
- Logs go to `userData/logs/wordlit.log`, rotated at 1 MB.
- Electron hardening: `contextIsolation`, `sandbox`, no `nodeIntegration`, a CSP, navigation and `window.open` denied, and IPC payloads validated.
- Single-instance lock. `disable-features=HardwareMediaKeyHandling,MediaSessionService` so Wordlit never grabs the media keys.

## 3. Toolchain
- Electron 44.4.4
- electron-vite 5.0.0 + Vite 7 (electron-vite does not support Vite 8 yet)
- TypeScript 6.0.3 (strict)
- Vitest 5
- `yaml` 2.9
- @electron/packager 20.3 (a portable folder with no installer, like Verci; this also avoids electron-builder's Windows symlink/winCodeSign pitfalls)

All runtime libraries are devDependencies and get bundled into `out/`. The packaged app has no `node_modules`. `smtc-bridge.ps1` ships as an `extraResource` (PowerShell can't read inside an asar).

## 4. Testing and verification
- **Unit tests (Vitest):**
  - LRC and lyricsfile parsers
  - word timing
  - normalise and match, including the Apple Music split
  - LRCLIB client with mocked `fetch` (found, 404→search, 503 retry, instrumental)
  - cache TTL
  - timeline extrapolation
  - session selection
  - palette contrast and determinism
  - lemmatiser and icon map (≥ 700 words, every referenced icon exists)
  - settings sanitising
  - active-word lookup
- **Fake player (E2E):** an Electron script plays generated silence with `navigator.mediaSession` metadata and `setPositionState`. It shows up in SMTC, so the bridge → lyrics → stage path can be tested with no real music. It uses a separate profile, and the lyrics are an **original fixture `.lrc` written for this project**.
- **Snapshot mode:** `--snapshot=<dir>` renders each style offscreen at fixed times using an original demo song, then saves PNGs for visual review. No overlay appears on the user's screen.
- **Live LRCLIB check:** an opt-in script (`npm run check:lrclib`) that asserts only on metadata (found, line count).
- **Packaged smoke test:** run `Wordlit.exe`, check the bridge starts, the tray appears and the log has no errors.

## 5. Out of scope (YAGNI)
- Unofficial word-level lyric sources.
- Drawing on the real Windows secure lock screen (not possible).
- Playback controls.
- Auto-update and code signing.
- Multi-display mirroring (one chosen display).
