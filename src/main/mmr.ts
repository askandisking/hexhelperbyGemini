export interface MatchSummary {
  queueId: number
  participants: Array<{
    stats: {
      win: boolean
      kills: number
      deaths: number
      assists: number
      totalDamageDealtToChampions?: number
    }
  }>
}

export interface PlayerMmrResult {
  puuid: string
  summonerName: string
  championId: number
  team: 'blue' | 'red'
  estimatedMmr: number
  winRate: number
  gamesAnalyzed: number
  kda: string
  tag: string
  hidden: boolean
}

const ARAM_LIKE_QUEUES = new Set([450, 900, 1700, 1710, 1900, 2400])

export function estimatePlayerMmr(
  puuid: string,
  summonerName: string,
  championId: number,
  team: 'blue' | 'red',
  games: MatchSummary[]
): PlayerMmrResult {
  if (!games || games.length === 0) {
    return {
      puuid,
      summonerName,
      championId,
      team,
      estimatedMmr: 1500,
      winRate: 0,
      gamesAnalyzed: 0,
      kda: '-',
      tag: '战绩隐藏/无记录',
      hidden: true
    }
  }

  const aramGames = games.filter((g) => ARAM_LIKE_QUEUES.has(g.queueId))
  const targetGames = aramGames.length >= 3 ? aramGames : games

  let wins = 0
  let kills = 0
  let deaths = 0
  let assists = 0
  let streakScore = 0

  targetGames.forEach((game, idx) => {
    const p = game.participants?.[0]?.stats
    if (!p) return
    if (p.win) wins++
    kills += p.kills || 0
    deaths += p.deaths || 0
    assists += p.assists || 0

    if (idx < 5) {
      streakScore += p.win ? 22 : -18
    }
  })

  const count = targetGames.length
  const winRate = count > 0 ? (wins / count) * 100 : 50
  const kdaVal = (kills + assists) / Math.max(1, deaths)

  const rawMmr =
    1500 +
    (winRate - 50) * 14 +
    Math.min(180, Math.max(-120, (kdaVal - 2.8) * 55)) +
    streakScore

  const estimatedMmr = Math.round(Math.max(800, Math.min(3200, rawMmr)))

  let tag = '实力均衡'
  if (estimatedMmr >= 2150) tag = '绝活大腿'
  else if (estimatedMmr >= 1850) tag = '高分猛男'
  else if (estimatedMmr <= 1250) tag = '快乐娱乐'

  return {
    puuid,
    summonerName,
    championId,
    team,
    estimatedMmr,
    winRate: Number(winRate.toFixed(1)),
    gamesAnalyzed: count,
    kda: kdaVal.toFixed(2),
    tag,
    hidden: false
  }
}
