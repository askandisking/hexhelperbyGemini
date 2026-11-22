import { BrowserWindow, screen } from 'electron'
import path from 'path'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1020,
    height: 700,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#091428',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile(path.join(__dirname, '../../src/renderer/main.html'))
  return win
}

export function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().bounds

  const overlay = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlay.setIgnoreMouseEvents(true, { forward: true })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.loadFile(path.join(__dirname, '../../src/renderer/overlay.html'))

  return overlay
}
