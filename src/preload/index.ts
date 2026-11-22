import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('helperApi', {
  toggleAutoAccept: (enabled: boolean, delayMs: number) =>
    ipcRenderer.send('toggle-auto-accept', { enabled, delayMs }),
  toggleOverlay: (enabled: boolean) => ipcRenderer.send('toggle-overlay', enabled),
  refreshMmr: () => ipcRenderer.send('refresh-mmr'),
  previewOverlay: (show: boolean) => ipcRenderer.send('preview-overlay', show),

  onLcuStatus: (cb: (data: any) => void) =>
    ipcRenderer.on('lcu-status', (_, data) => cb(data)),
  onLcuPhase: (cb: (phase: string) => void) =>
    ipcRenderer.on('lcu-phase', (_, phase) => cb(phase)),
  onMmrUpdate: (cb: (players: any[]) => void) =>
    ipcRenderer.on('mmr-update', (_, players) => cb(players)),
  onLog: (cb: (msg: string) => void) =>
    ipcRenderer.on('log', (_, msg) => cb(msg)),
  onOverlayUpdate: (cb: (payload: any) => void) =>
    ipcRenderer.on('overlay-update', (_, payload) => cb(payload))
})
