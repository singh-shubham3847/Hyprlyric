<p align="center">
  <a href="https://github.com/singh-shubham3847/Hyprlyric/releases"><img alt="Download Hyprlyric" src="https://img.shields.io/badge/download-v1.0.0-ca415e?logo=windows&logoColor=white"></a>
  <a href="https://github.com/singh-shubham3847/Hyprlyric/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/singh-shubham3847/Hyprlyric/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-ca415e">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-ca415e"></a>
</p>

**Hyprlyric** is a high-performance, next-generation lyric visualizer for Windows that renders song lyrics dynamically in 3D space, synced word-for-word in real time. It sits quietly in the Windows system tray and tracks Spotify, Apple Music, and all Windows media sessions. Watch lyrics rotate in 3D on a kinetic tesseract cube or float gracefully over your desktop while you work.

Free and open-source, with no accounts or API keys required.

## Features

- **Kinetic 3D Tesseract & Multi-Style Visualizations**: Full 3D tesseract cube navigation with dynamic camera tracking and emoji/icon visualizer support.
- **Ultra-Low Resource Footprint**: Optimized with sub-pixel throttling, off-screen viewport culling, and capped worker pools to run lean (<5% CPU, minimal RAM).
- **Exact & Synchronized Word Timing**: Queries **LRCLIB** and **NetEase Cloud Music** simultaneously for native per-word karaoke sync and intelligent syllable-based pacing.
- **Desktop Overlay & Lock Screen Saver**: Float lyrics seamlessly over your workspace with click-through transparency, or turn your idle monitor into an ambient lock screen display with a live clock.
- **Ambient Album Art Backdrop & Now-Playing HUD**: Generates smooth breathing color gradients and real-time track progress cards matching the album palette.
- **Universal Media Player Integration**: Direct integration with Windows SMTC (Spotify, Apple Music, Tidal, YouTube Music, web browsers, etc.).
- **Custom Local Lyrics (.lrc)**: Priority loading for your own `.lrc` and enhanced word-timed files.

## Download

Choose either the installer or the portable zip from [Releases](https://github.com/singh-shubham3847/Hyprlyric/releases) (Windows 10 or 11, 64-bit):

- **Windows Installer (Recommended)**: Download **`Hyprlyric-Setup-1.0.0.exe`** and run the wizard. It sets up Start menu shortcuts, an optional desktop icon, and cleanly manages updates/uninstallation.
- **Portable ZIP**: Download **`Hyprlyric-1.0.0-win-x64.zip`**, extract anywhere, and run `Hyprlyric.exe`. No installation required.

> [!NOTE]
> The app isn't code-signed, so Windows SmartScreen may say *"Windows protected your PC"* the first time. Click **More info → Run anyway**. Every release is built from the source in this repository, and you can build it yourself (see [Build from source](#build-from-source)).

## Display Styles

- **Tesseract (3D Cube)**: Kinetic 3D word-cube rotating seamlessly across adjacent faces (left, right, up, down) with dynamic close-up camera navigation. Pure typographic focus.
- **Tesseract Visual**: The 3D kinetic word-cube enhanced with matching Fluent icons and emojis beside sung words.
- **Fisheye**: A convex stack of words under a real glass-lens shader. The word being sung sits closest to the glass.
- **Fisheye Visual**: The same lens shader, with icons and emojis beside the words.
- **Visual**: One word at a time, with a matching icon or emoji beside it.

## How to use it

1. Play a song in **Spotify**, **Apple Music**, or any supported media player.
2. Press **Ctrl+Alt+L**. The lyrics fill the screen. Press **Esc** to close them.
3. Every setting is in the tray icon. On Windows 11 it may be hidden under the **^** arrow; drag it onto the taskbar to keep it visible.

### Where the lyrics show

Pick one in tray → **Show Lyrics**.

- **On the Lock Screen** (the default): Full-screen lyrics display with an ambient clock.
  - **Ctrl+Alt+L** opens it. It stays up while you move the mouse or skip songs. **Esc** closes it, and so does pressing **Ctrl+Alt+L** again.
  - **When you're away:** After 2 minutes without input, while a song with lyrics is playing, the lyrics screen opens on its own and closes when you come back. Change the delay or turn it off in tray → **Lyrics Screen When Idle**.
  - **Lock Windows When I Come Back** (off by default) turns Ctrl+Alt+L into "lock my PC with lyrics". Any key or mouse move then closes the lyrics and locks Windows, requiring your PIN or password.
- **Always**: Words float smoothly above all open windows. Clicks pass straight through them, and they automatically hide 3 seconds after you pause.

### Colours & Personalization

- The default palette is red for sung words, a pink highlight, and soft pink for words still to come.
- **Auto Sync** automatically extracts the vibrant color scheme from the album art and keeps contrast readable on dark backgrounds.
- **Lyric Text…**, **Highlight…** and **Secondary Text…** let you pick your own custom colors. **Reset Colors** restores the default palette.

### Tray Menu Options

| Setting | What it does |
|---|---|
| **Display** | Picks the monitor the lyrics appear on. |
| **Style** | Tesseract (3D Cube), Tesseract Visual, Fisheye, Fisheye Visual or Visual. |
| **Ambient Album Art Backdrop** | Softly blurred, breathing cover art backdrop behind full-screen lyrics. |
| **Now-Playing Info Card** | Displays cover art thumbnail, track title, artist and real-time progress card. |
| **Timing** | Shifts words earlier or later. Bluetooth headphones usually need *0.25–0.5 s Later*. |
| **Precise Word Timing (NetEase)** | Uses real per-word timing when NetEase has the song (toggleable). |
| **Players** | *Spotify and Apple Music*, or *All Media Apps* (browsers, YouTube Music, etc.). |
| **Open Lyrics Folder** | Opens `%APPDATA%\hyprlyric\Lyrics` for your own `.lrc` files. |
| **Start with Windows** | Starts the app quietly in the tray when you sign in. |

While a song with lyrics plays, your display stays awake. When the music stops, Windows' normal sleep and lock timers resume.

## Where the lyrics come from

Two free sources are queried concurrently:

- **[LRCLIB](https://lrclib.net)**, an open, community-run lyrics database providing synced line timings for millions of songs. Hyprlyric computes per-word timing using syllable cadence, punctuation, and song tempo, automatically re-synchronizing at every line boundary.
- **NetEase Cloud Music**, queried via public endpoints for exact, native per-word karaoke timestamps.

### Custom Lyrics (.lrc)
Your own lyrics take precedence over online providers. Put `.lrc` files in the lyrics directory (tray → **Open Lyrics Folder**, located at `%APPDATA%\hyprlyric\Lyrics`), named `Artist - Title.lrc`. Enhanced LRC with `<mm:ss.xx>` word timestamps is parsed directly.

Lyrics are cached locally in `%APPDATA%\hyprlyric\lyrics-cache` for instant playback.

## Privacy

- The app sends only the song's **title, artist, album, and duration** to `lrclib.net` (and `music.163.com` if precise timing is enabled).
- No accounts, telemetry, user tracking, or advertisements.
- All configuration, cache, and logs remain strictly local on your PC in `%APPDATA%\hyprlyric`.

## Troubleshooting

| Problem | Fix |
|---|---|
| The first launch takes a few seconds | Windows Defender scans new executables once. Subsequent launches are instantaneous. |
| Tray says *Cannot read what is playing* | Hyprlyric reads Windows Media Sessions via Windows PowerShell 5.1. Ensure `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` is available and not blocked by policy. Check `%APPDATA%\hyprlyric\logs\hyprlyric.log` for details. |
| *No synced lyrics for …* | Neither source contains timed lyrics for this track. Place a custom `.lrc` file in your lyrics directory. |
| Words light up early or late | Adjust tray → **Timing** offset. Bluetooth audio typically needs a +0.25s to +0.5s delay. |
| Ctrl+Alt+L does nothing | Another application has registered that global hotkey. Use the tray menu instead. |
| Moving mouse locks Windows | **Lock Windows When I Come Back** is enabled. Disable it in the tray. |

- **Log file:** `%APPDATA%\hyprlyric\logs\hyprlyric.log`
- **Settings:** `%APPDATA%\hyprlyric\settings.json`

## Build from source

Requires Windows 10 or 11 and [Node.js](https://nodejs.org) 22.12 or newer.

```powershell
git clone https://github.com/singh-shubham3847/hyprlyric.git
cd hyprlyric
npm install
npm run dev
```

### Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app in development mode with hot reload. |
| `npm test` | Runs the complete unit test suite (Vitest). |
| `npm run typecheck` | Runs strict TypeScript checks for main and renderer processes. |
| `npm run package` | Builds the portable zip and compiles the Inno Setup installer into `release\`. |
| `npm run installer` | Packages the application and builds `Hyprlyric-Setup-1.0.0.exe`. |
| `npm run snapshot` | Renders all visual styles off-screen to `snapshots\*.png`. |
| `npm run banner` | Re-generates the project banner image (`docs/images/banner.png`). |
| `npm run fake-player` | Starts a silent mock player session for local testing. |
| `npm run check:lrclib` | Runs live connectivity test against lrclib.net. |
| `npm run icons` | Re-generates application and tray icons. |

## Project Structure

```
src/main/       Main process: SMTC media bridge, lyrics providers, cache, settings, tray & windows
src/preload/    Context isolation bridge between renderer and main process
src/renderer/   Lyric visualizer renderer (Tesseract 3D, Fisheye, Visual) and settings UI
src/shared/     Shared TypeScript definitions and IPC contracts
resources/      SMTC bridge PowerShell script and icon assets
docs/           Screenshots, banners, and technical specifications
```

## Credits

- Inspired by [Verci](https://verci.xyz) for macOS.
- Lyrics provided by [LRCLIB](https://lrclib.net) and NetEase Cloud Music.
- Typography: [Inter](https://rsms.me/inter/) (SIL OFL 1.1).
- Icons: [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) (MIT) and Segoe UI Emoji.
- Built with [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [Three.js](https://threejs.org), and [TypeScript](https://www.typescriptlang.org).
- Third-party licenses documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Hyprlyric is an independent open-source project and is not affiliated with or endorsed by Verci, Spotify, Apple, NetEase, or LRCLIB.

## License

[MIT](LICENSE) © 2026 singh-shubham3847
