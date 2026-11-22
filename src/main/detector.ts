import fs from 'fs'
import https from 'https'
import path from 'path'
import { Monitor } from 'node-screenshots'
import { RapidOcrSidecar } from './ocr'

export interface AugmentEntry {
  name: string
  tier: 'S+' | 'S' | 'A' | 'B' | 'C'
  winRate: number
  desc: string
  synergyChampions: string[]
}

export interface AugmentRecommendation {
  slotIndex: number
  name: string
  tier: string
  winRate: number
  desc: string
  isSynergy: boolean
  isBest: boolean
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

export class HextechDetector {
  private augments: AugmentEntry[] = []
  private ocr: RapidOcrSidecar
  private timer: NodeJS.Timeout | null = null
  private onRecommend: (recs: AugmentRecommendation[], champion: string) => void

  constructor(
    resourcesDir: string,
    ocr: RapidOcrSidecar,
    onRecommend: (recs: AugmentRecommendation[], champion: string) => void
  ) {
    this.ocr = ocr
    this.onRecommend = onRecommend
    const dataPath = path.join(resourcesDir, 'hextech-data.json')
    if (fs.existsSync(dataPath)) {
      const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      this.augments = parsed.augments || []
    }
  }

  public startPolling() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 900)
  }

  public stopPolling() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.onRecommend([], '')
  }

  private getActiveChampion(): Promise<string> {
    return new Promise((resolve) => {
      const req = https.get(
        'https://127.0.0.1:2999/liveclientdata/allgamedata',
        { rejectUnauthorized: false, timeout: 500 },
        (res) => {
          let raw = ''
          res.on('data', (c) => (raw += c))
          res.on('end', () => {
            try {
              const data = JSON.parse(raw)
              const activeName = data?.activePlayer?.summonerName
              const me = (data?.allPlayers || []).find(
                (p: any) => p.summonerName === activeName
              )
              resolve(me?.rawChampionName?.replace('game_character_displayname_', '') || '')
            } catch {
              resolve('')
            }
          })
        }
      )
      req.on('error', () => resolve(''))
      req.on('timeout', () => {
        req.destroy()
        resolve('')
      })
    })
  }

  private matchAugment(ocrText: string): AugmentEntry | null {
    const clean = ocrText.replace(/[^\u4e00-\u9fa5]/g, '')
    if (clean.length < 2) return null

    let best: AugmentEntry | null = null
    let minDist = Infinity

    for (const item of this.augments) {
      if (clean.includes(item.name) || item.name.includes(clean)) {
        return item
      }
      const dist = levenshtein(clean, item.name)
      if (dist < minDist) {
        minDist = dist
        best = item
      }
    }

    return best && minDist <= Math.max(1, Math.floor(best.name.length * 0.35)) ? best : null
  }

  private async tick() {
    const champion = await this.getActiveChampion()
    const monitor = Monitor.fromPoint(0, 0)
    if (!monitor) return

    const screenshot = monitor.captureImageSync()
    const w = screenshot.width
    const h = screenshot.height

    const regions = [
      { x: Math.floor(w * 0.21), y: Math.floor(h * 0.42), width: Math.floor(w * 0.16), height: Math.floor(h * 0.06) },
      { x: Math.floor(w * 0.42), y: Math.floor(h * 0.42), width: Math.floor(w * 0.16), height: Math.floor(h * 0.06) },
      { x: Math.floor(w * 0.63), y: Math.floor(h * 0.42), width: Math.floor(w * 0.16), height: Math.floor(h * 0.06) }
    ]

    const recs: AugmentRecommendation[] = []

    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]
      const pngBuf = screenshot.cropSync(r.x, r.y, r.width, r.height).toPngSync()
      const text = await this.ocr.recognizeBase64(pngBuf.toString('base64'))
      const matched = this.matchAugment(text)
      if (matched) {
        const isSynergy =
          !!champion &&
          matched.synergyChampions.some((c) => c.toLowerCase() === champion.toLowerCase())
        recs.push({
          slotIndex: i,
          name: matched.name,
          tier: matched.tier,
          winRate: matched.winRate,
          desc: matched.desc,
          isSynergy,
          isBest: false
        })
      }
    }

    if (recs.length > 0) {
      let bestIdx = 0
      let bestScore = -1
      recs.forEach((rec, idx) => {
        const score = rec.winRate + (rec.isSynergy ? 4.5 : 0)
        if (score > bestScore) {
          bestScore = score
          bestIdx = idx
        }
      })
      recs[bestIdx].isBest = true
      this.onRecommend(recs, champion)
    } else {
      this.onRecommend([], champion)
    }
  }

  public getMockRecommendations(): AugmentRecommendation[] {
    const sample = this.augments.slice(0, 3)
    return sample.map((item, idx) => ({
      slotIndex: idx,
      name: item.name,
      tier: item.tier,
      winRate: item.winRate,
      desc: item.desc,
      isSynergy: idx === 0,
      isBest: idx === 0
    }))
  }
}
