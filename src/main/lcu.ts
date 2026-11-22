import {
  authenticate,
  createHttp1Request,
  createWebSocketConnection,
  Credentials
} from 'league-connect'
import { estimatePlayerMmr, MatchSummary, PlayerMmrResult } from './mmr'

export interface LcuCallbacks {
  onStatusChange: (connected: boolean, summonerName?: string) => void
  onPhaseChange: (phase: string) => void
  onMmrUpdated: (players: PlayerMmrResult[]) => void
  onLog: (msg: string) => void
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIdx = 0

  async function next() {
    while (nextIdx < items.length) {
      const current = nextIdx++
      results[current] = await worker(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()))
  return results
}

export class LcuService {
  private credentials: Credentials | null = null
  private autoAccept = true
  private acceptDelayMs = 800
  private callbacks: LcuCallbacks
  private running = false

  constructor(callbacks: LcuCallbacks) {
    this.callbacks = callbacks
  }

  public setAutoAccept(enabled: boolean, delayMs?: number) {
    this.autoAccept = enabled
    if (typeof delayMs === 'number') this.acceptDelayMs = delayMs
    this.callbacks.onLog(`自动接受对局已${enabled ? '开启' : '关闭'} (延迟 ${this.acceptDelayMs}ms)`)
  }

  public async start() {
    if (this.running) return
    this.running = true
    this.connectLoop()
  }

  private async connectLoop() {
    while (this.running) {
      try {
        this.callbacks.onStatusChange(false)
        this.callbacks.onLog('正在等待英雄联盟客户端启动...')
        this.credentials = await authenticate({ awaitConnection: true, pollInterval: 2000 })

        const meRes = await createHttp1Request(
          { method: 'GET', url: '/lol-summoner/v1/current-summoner' },
          this.credentials
        )
        const me = meRes.json()
        const name = me?.gameName ? `${me.gameName}#${me.tagLine}` : me?.displayName || '已连接'
        this.callbacks.onStatusChange(true, name)
        this.callbacks.onLog(`已连接客户端：${name}`)

        const ws = await createWebSocketConnection({
          authenticationOptions: { awaitConnection: true }
        })

        ws.subscribe('/lol-matchmaking/v1/ready-check', (data: any) => {
          if (!this.autoAccept || !this.credentials) return
          if (data?.state === 'InProgress' && data?.playerResponse === 'None') {
            this.callbacks.onLog(`检测到匹配就绪，${this.acceptDelayMs}ms 后自动接受...`)
            setTimeout(async () => {
              try {
                await createHttp1Request(
                  { method: 'POST', url: '/lol-matchmaking/v1/ready-check/accept' },
                  this.credentials!
                )
                this.callbacks.onLog('已自动接受对局')
              } catch (err) {
                this.callbacks.onLog(`自动接受失败: ${(err as Error).message}`)
              }
            }, this.acceptDelayMs)
          }
        })

        ws.subscribe('/lol-gameflow/v1/gameflow-phase', async (phase: string) => {
          this.callbacks.onPhaseChange(phase)
          this.callbacks.onLog(`当前游戏阶段: ${phase}`)
          if (phase === 'InProgress' || phase === 'ChampSelect') {
            await this.fetchCurrentMatchMmr()
          }
        })

        await new Promise<void>((resolve) => {
          ws.on('close', () => resolve())
          ws.on('error', () => resolve())
        })
        this.callbacks.onLog('与客户端断开连接，准备重连...')
      } catch {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }

  public async fetchCurrentMatchMmr() {
    if (!this.credentials) return
    try {
      const sessionRes = await createHttp1Request(
        { method: 'GET', url: '/lol-gameflow/v1/session' },
        this.credentials
      )
      const session = sessionRes.json()
      const teamOne: any[] = session?.gameData?.teamOne || []
      const teamTwo: any[] = session?.gameData?.teamTwo || []

      const rawPlayers = [
        ...teamOne.map((p) => ({ ...p, team: 'blue' as const })),
        ...teamTwo.map((p) => ({ ...p, team: 'red' as const }))
      ].filter((p) => p.puuid && p.puuid !== '00000000-0000-0000-0000-000000000000')

      if (rawPlayers.length === 0) return

      this.callbacks.onLog(`正在查询本局 ${rawPlayers.length} 名玩家的公开战绩并估算隐藏分...`)

      const results = await runWithConcurrency(rawPlayers, 4, async (player) => {
        try {
          const histRes = await createHttp1Request(
            {
              method: 'GET',
              url: `/lol-match-history/v1/products/lol/${player.puuid}/matches?begIndex=0&endIndex=19`
            },
            this.credentials!
          )
          const games: MatchSummary[] = histRes.json()?.games?.games || []
          const displayName =
            player.riotIdGameName || player.summonerName || player.puuid.slice(0, 8)
          return estimatePlayerMmr(
            player.puuid,
            displayName,
            player.championId || 0,
            player.team,
            games
          )
        } catch {
          return estimatePlayerMmr(
            player.puuid,
            player.summonerName || '未知玩家',
            player.championId || 0,
            player.team,
            []
          )
        }
      })

      this.callbacks.onMmrUpdated(results)
      this.callbacks.onLog('本局全员估算隐藏分刷新完成')
    } catch (err) {
      this.callbacks.onLog(`拉取对局成员失败: ${(err as Error).message}`)
    }
  }
}
