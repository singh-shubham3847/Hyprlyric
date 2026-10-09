import '../css/colors.css'
import type { ColorsState } from '@shared/ipc'
import type { ColorRole } from '@shared/types'

const api = window.lyricsApp.colors

const ROLES: { role: ColorRole; name: string; hint: string }[] = [
  { role: 'lyric', name: 'Lyric Text', hint: 'Words already sung' },
  { role: 'highlight', name: 'Highlight', hint: 'The word being sung' },
  { role: 'secondary', name: 'Secondary Text', hint: 'Words coming up' }
]

const root = document.getElementById('colors')!
root.innerHTML = `
  <header>
    <h1>Colors</h1>
    <label class="switch">
      <input type="checkbox" id="auto" />
      <span class="track"><span class="thumb"></span></span>
      <span>Auto Sync</span>
    </label>
  </header>
  <p class="note" id="note"></p>
  <div class="wells">
    ${ROLES.map(
      (r) => `
      <label class="well">
        <input type="color" data-role="${r.role}" />
        <span class="text"><span class="name">${r.name}</span><span class="hint">${r.hint}</span></span>
        <code data-hex="${r.role}"></code>
      </label>`
    ).join('')}
  </div>
  <div class="preview" aria-hidden="true">
    <span class="p-lyric">sung</span>
    <span class="p-box"><span class="p-text">now</span></span>
    <span class="p-secondary">next</span>
  </div>
  <footer><button type="button" id="reset">Reset Colors</button></footer>
`

const auto = document.getElementById('auto') as HTMLInputElement
const note = document.getElementById('note')!
const wells = [...root.querySelectorAll<HTMLInputElement>('input[type=color]')]

function render(state: ColorsState): void {
  auto.checked = state.autoSync
  note.textContent = state.autoSync
    ? 'Colors follow the album art of whatever is playing. Pick a color to set your own.'
    : 'Choose the lyric, highlight and secondary colors yourself, or turn on Auto Sync.'
  for (const input of wells) {
    const role = input.dataset.role as ColorRole
    const shown = state.autoSync ? state.effective[role] : state.colors[role]
    if (document.activeElement !== input) input.value = shown
    root.querySelector(`[data-hex="${role}"]`)!.textContent = shown.toUpperCase()
  }
  const s = document.documentElement.style
  s.setProperty('--lyric', state.effective.lyric)
  s.setProperty('--highlight', state.effective.highlight)
  s.setProperty('--highlight-text', state.effective.highlightText)
  s.setProperty('--secondary', state.effective.secondary)
}

// The picker fires continuously while dragging; send at most once per frame.
const queued = new Map<ColorRole, string>()
let scheduled = false
function queue(role: ColorRole, hex: string): void {
  queued.set(role, hex)
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    for (const [r, h] of queued) api.set(r, h)
    queued.clear()
  })
}

for (const input of wells) {
  input.addEventListener('input', () => queue(input.dataset.role as ColorRole, input.value))
}
auto.addEventListener('change', () => api.setAutoSync(auto.checked))
document.getElementById('reset')!.addEventListener('click', () => api.reset())

api.onState(render)
void api.get().then((state) => {
  if (state) render(state)
})
