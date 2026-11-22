const lcuBadge = document.getElementById('lcuBadge')
const phaseBadge = document.getElementById('phaseBadge')
const autoAcceptChk = document.getElementById('autoAcceptChk')
const delayInput = document.getElementById('delayInput')
const overlayChk = document.getElementById('overlayChk')
const previewBtn = document.getElementById('previewBtn')
const refreshMmrBtn = document.getElementById('refreshMmrBtn')
const blueBody = document.getElementById('blueBody')
const redBody = document.getElementById('redBody')
const blueAvg = document.getElementById('blueAvg')
const redAvg = document.getElementById('redAvg')
const logBox = document.getElementById('logBox')

let previewing = false

function syncAutoAccept() {
  window.helperApi.toggleAutoAccept(autoAcceptChk.checked, Number(delayInput.value) || 800)
}

autoAcceptChk.addEventListener('change', syncAutoAccept)
delayInput.addEventListener('change', syncAutoAccept)

overlayChk.addEventListener('change', () => {
  window.helperApi.toggleOverlay(overlayChk.checked)
})

previewBtn.addEventListener('click', () => {
  previewing = !previewing
  previewBtn.textContent = previewing ? '关闭悬浮窗预览' : '预览悬浮窗效果'
  window.helperApi.previewOverlay(previewing)
})

refreshMmrBtn.addEventListener('click', () => {
  window.helperApi.refreshMmr()
})

window.helperApi.onLcuStatus(({ connected, summonerName }) => {
  if (connected) {
    lcuBadge.textContent = `已连接: ${summonerName}`
    lcuBadge.classList.add('online')
  } else {
    lcuBadge.textContent = '等待客户端...'
    lcuBadge.classList.remove('online')
  }
})

window.helperApi.onLcuPhase((phase) => {
  phaseBadge.textContent = `阶段: ${phase}`
})

window.helperApi.onMmrUpdate((players) => {
  const blue = players.filter((p) => p.team === 'blue')
  const red = players.filter((p) => p.team === 'red')

  const renderRows = (list) => {
    if (!list.length) return '<tr><td colspan="5" style="color:#5b5a56;">暂无数据</td></tr>'
    return list
      .map(
        (p) => `
      <tr>
        <td>${p.summonerName}</td>
        <td class="mmr-score">${p.hidden ? '隐藏' : p.estimatedMmr}</td>
        <td>${p.hidden ? '-' : p.winRate + '%'}</td>
        <td>${p.kda}</td>
        <td><span class="tag">${p.tag}</span></td>
      </tr>`
      )
      .join('')
  }

  const calcAvg = (list) => {
    const valid = list.filter((p) => !p.hidden)
    if (!valid.length) return '-'
    return Math.round(valid.reduce((s, p) => s + p.estimatedMmr, 0) / valid.length)
  }

  blueBody.innerHTML = renderRows(blue)
  redBody.innerHTML = renderRows(red)
  blueAvg.textContent = `均分: ${calcAvg(blue)}`
  redAvg.textContent = `均分: ${calcAvg(red)}`
})

window.helperApi.onLog((msg) => {
  const line = document.createElement('div')
  line.textContent = msg
  logBox.appendChild(line)
  logBox.scrollTop = logBox.scrollHeight
})
