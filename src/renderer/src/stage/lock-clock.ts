const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

/** Time and date at the top of the lock-style screen, like the Windows lock screen. */
export class LockClock {
  private readonly el: HTMLDivElement
  private readonly time: HTMLDivElement
  private readonly date: HTMLDivElement
  private shownMinute = -1

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'lock-clock'
    this.time = document.createElement('div')
    this.time.className = 'lock-time'
    this.date = document.createElement('div')
    this.date.className = 'lock-date'
    this.el.append(this.time, this.date)
    parent.append(this.el)
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible
  }

  update(epochMs: number): void {
    const minute = Math.floor(epochMs / 60_000)
    if (minute === this.shownMinute) return
    this.shownMinute = minute
    const now = new Date(epochMs)
    // Windows shows the time without AM/PM on the lock screen.
    this.time.textContent = timeFormat
      .formatToParts(now)
      .filter((part) => part.type !== 'dayPeriod')
      .map((part) => part.value)
      .join('')
      .trim()
    this.date.textContent = dateFormat.format(now)
  }
}
