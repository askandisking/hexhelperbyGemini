import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { HextechDetector } from './detector'
import { LcuService } from './lcu'
import { RapidOcrSidecar } from './ocr'
import { createMainWindow, createOverlayWindow } from './windows'

let mainWin: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null
let lcuService: LcuService | null = null
let ocrSidecar: RapidOcrSidecar | null = null
let detector: HextechDetector | null = null
let overlayEnabled = true

function getResourcesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(__dirname, '../../resources')
}

function sendLog(msg: string) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  mainWin?.webContents.send('log', `[${time}] ${msg}`)
}

app.whenReady().then(() => {
  mainWin = createMainWindow()
  overlayWin = createOverlayWindow()

  const resourcesDir = getResourcesDir()
  ocrSidecar = new RapidOcrSidecar(resourcesDir)
  ocrSidecar.start(sendLog)

  detector = new HextechDetector(resourcesDir, ocrSidecar, (recs, champion) => {
    if (!overlayEnabled) {
      overlayWin?.webContents.send('overlay-update', { recs: [], champion })
      return
    }
    overlayWin?.webContents.send('overlay-update', { recs, champion })
  })

  lcuService = new LcuService({
    onStatusChange: (connected, summonerName) => {
      mainWin?.webContents.send('lcu-status', { connected, summonerName })
    },
    onPhaseChange: (phase) => {
      mainWin?.webContents.send('lcu-phase', phase)
      if (phase === 'InProgress') {
        detector?.startPolling()
      } else {
        detector?.stopPolling()
      }
    },
    onMmrUpdated: (players) => {
      mainWin?.webContents.send('mmr-update', players)
    },
    onLog: sendLog
  })

  lcuService.start()

  ipcMain.on('toggle-auto-accept', (_, { enabled, delayMs }) => {
    lcuService?.setAutoAccept(enabled, delayMs)
  })

  ipcMain.on('toggle-overlay', (_, enabled: boolean) => {
    overlayEnabled = enabled
    if (!enabled) overlayWin?.webContents.send('overlay-update', { recs: [], champion: '' })
    sendLog(`局内海克斯悬浮窗已${enabled ? '开启' : '关闭'}`)
  })

  ipcMain.on('refresh-mmr', () => {
    lcuService?.fetchCurrentMatchMmr()
  })

  ipcMain.on('preview-overlay', (_, show: boolean) => {
    const recs = show ? detector?.getMockRecommendations() || [] : []
    overlayWin?.webContents.send('overlay-update', { recs, champion: show ? 'Lux (预览)' : '' })
  })

  mainWin.on('closed', () => {
    detector?.stopPolling()
    ocrSidecar?.stop()
    overlayWin?.close()
    app.quit()
  })
})
