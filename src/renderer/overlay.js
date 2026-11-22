const slots = [
  document.getElementById('slot-0'),
  document.getElementById('slot-1'),
  document.getElementById('slot-2')
]

window.helperApi.onOverlayUpdate(({ recs, champion }) => {
  slots.forEach((el) => {
    el.style.display = 'none'
    el.classList.remove('best')
    el.innerHTML = ''
  })

  if (!recs || recs.length === 0) return

  recs.forEach((rec) => {
    const el = slots[rec.slotIndex]
    if (!el) return
    el.style.display = 'block'
    if (rec.isBest) el.classList.add('best')

    const tierClass = rec.tier === 'S+' ? 'tier sp' : 'tier'
    el.innerHTML = `
      <div class="top-bar">
        <span class="${tierClass}">${rec.tier} 级</span>
        <span class="winrate">胜率 ${rec.winRate}%</span>
      </div>
      <div class="name">${rec.name}</div>
      <div class="badges">
        ${rec.isBest ? '<span class="badge best">🔥 本轮首选</span>' : ''}
        ${rec.isSynergy ? `<span class="badge syn">⭐ 契合 ${champion || '当前英雄'}</span>` : ''}
      </div>
      <div class="desc">${rec.desc}</div>
    `
  })
})
