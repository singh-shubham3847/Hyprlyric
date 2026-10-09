import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type LyricsAppApi } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: LyricsAppApi = {
  stage: {
    onState: (cb) => subscribe(IPC.stageState, cb),
    onAnchor: (cb) => subscribe(IPC.stageAnchor, cb),
    onSnapshot: (cb) => subscribe(IPC.stageSnapshot, cb),
    onSession: (cb) => subscribe(IPC.stageSession, cb),
    snapshotDone: (id) => ipcRenderer.send(IPC.stageSnapshotDone, id),
    dismiss: (request) =>
      ipcRenderer.send(IPC.stageDismiss, {
        kind: request.kind === 'escape' ? 'escape' : 'input',
        detail: String(request.detail).slice(0, 200)
      })
  },
  colors: {
    get: () => ipcRenderer.invoke(IPC.colorsGet),
    set: (role, hex) => ipcRenderer.send(IPC.colorsSet, role, hex),
    setAutoSync: (on) => ipcRenderer.send(IPC.colorsAutoSync, on),
    reset: () => ipcRenderer.send(IPC.colorsReset),
    onState: (cb) => subscribe(IPC.colorsState, cb)
  }
}

contextBridge.exposeInMainWorld('lyricsApp', api)
