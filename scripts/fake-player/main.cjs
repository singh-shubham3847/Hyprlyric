// Test helper: a hidden "music player" that shows up in Windows' media controls (SMTC) exactly
// like Spotify does, but plays an inaudible tone. Lets Hyprlyric be tested end to end at any hour.
//   electron scripts/fake-player/main.cjs [--title=..] [--artist=..] [--album=..] [--seconds=40] [--start=0]
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

app.setAppUserModelId('hyprlyric.FakePlayer')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 120,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true }
  })
  await win.loadFile(path.join(__dirname, 'player.html'), {
    query: {
      title: arg('title', 'Paper Lanterns'),
      artist: arg('artist', 'Lantern Test Band'),
      album: arg('album', 'Fixtures'),
      seconds: arg('seconds', '40'),
      start: arg('start', '0')
    }
  })
  win.webContents.on('console-message', (event) => console.log(`[player] ${event.message}`))
})

app.on('window-all-closed', () => app.quit())
