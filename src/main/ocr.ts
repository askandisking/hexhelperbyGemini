import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

interface PendingTask {
  resolve: (text: string) => void
  reject: (err: Error) => void
}

export class RapidOcrSidecar {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready = false
  private queue: Array<{ base64: string; task: PendingTask }> = []
  private busy = false
  private exePath: string

  constructor(resourcesDir: string) {
    this.exePath = path.join(resourcesDir, 'rapidocr', 'RapidOCR-json.exe')
  }

  public start(onLog: (msg: string) => void): boolean {
    if (!fs.existsSync(this.exePath)) {
      onLog(`未检测到 OCR 引擎 (${this.exePath})，海克斯自动识别暂不可用`)
      return false
    }

    this.proc = spawn(this.exePath, [], {
      cwd: path.dirname(this.exePath),
      windowsHide: true
    })

    const rl = readline.createInterface({ input: this.proc.stdout })
    rl.on('line', (line) => {
      if (!this.ready && line.includes('OCR init completed')) {
        this.ready = true
        onLog('RapidOCR 本地识别引擎已就绪')
        this.flush()
        return
      }

      if (this.busy && line.trim().startsWith('{')) {
        const current = this.queue.shift()
        this.busy = false
        try {
          const parsed = JSON.parse(line)
          if (parsed.code === 100 && Array.isArray(parsed.data)) {
            const text = parsed.data.map((item: any) => item.text).join('')
            current?.task.resolve(text)
          } else {
            current?.task.resolve('')
          }
        } catch {
          current?.task.resolve('')
        }
        this.flush()
      }
    })

    this.proc.on('exit', () => {
      this.ready = false
      this.proc = null
    })

    return true
  }

  public recognizeBase64(base64Png: string): Promise<string> {
    if (!this.proc || !this.ready) return Promise.resolve('')
    return new Promise((resolve, reject) => {
      this.queue.push({ base64: base64Png, task: { resolve, reject } })
      this.flush()
    })
  }

  private flush() {
    if (this.busy || !this.ready || !this.proc || this.queue.length === 0) return
    this.busy = true
    const payload = JSON.stringify({ image_base64: this.queue[0].base64 }) + '\n'
    this.proc.stdin.write(payload)
  }

  public stop() {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
      this.ready = false
    }
  }
}
