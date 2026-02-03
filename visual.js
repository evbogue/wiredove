// Disabled: reverted to apds.visual buffer from previous implementation.
/*
const cache = new Map()

const hashSeed = (value) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6D2B79F5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const decodeKeyBytes = (key) => {
  if (!key) { return [] }
  try {
    const cleaned = String(key).trim()
    if (typeof atob === 'function') {
      const binary = atob(cleaned)
      return Array.from(binary, (ch) => ch.charCodeAt(0))
    }
  } catch {}
  return Array.from(String(key), (ch) => ch.charCodeAt(0))
}

const buildWorld = (key, size) => {
  const seed = hashSeed(String(key || ''))
  const rand = mulberry32(seed)
  const bytes = decodeKeyBytes(key)
  const hues = []
  const total = Math.max(6, Math.min(12, bytes.length))
  for (let i = 0; i < total; i += 1) {
    const value = bytes[i % bytes.length] || Math.floor(rand() * 256)
    hues.push(Math.floor((value / 255) * 360))
  }

  const canvas = document.createElement('canvas')
  const canvasSize = Math.round(size * 3.2)
  canvas.width = canvasSize
  canvas.height = canvasSize
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, canvasSize, canvasSize)
  bg.addColorStop(0, `hsl(${hues[0]}, 45%, 8%)`)
  bg.addColorStop(1, `hsl(${hues[1] || hues[0]}, 55%, 14%)`)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvasSize, canvasSize)

  const starCount = Math.floor(canvasSize * canvasSize / 900)
  for (let i = 0; i < starCount; i += 1) {
    const x = rand() * canvasSize
    const y = rand() * canvasSize
    const r = 0.3 + rand() * 1.2
    const a = 0.2 + rand() * 0.6
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const radius = canvasSize * (0.52 + rand() * 0.08)
  const cx = canvasSize * (0.5 + (rand() - 0.5) * 0.08)
  const cy = canvasSize * (0.5 + (rand() - 0.5) * 0.08)

  const lightAngle = rand() * Math.PI * 2
  const lightOffsetX = Math.cos(lightAngle) * radius * 0.45
  const lightOffsetY = Math.sin(lightAngle) * radius * 0.45
  const surface = ctx.createRadialGradient(
    cx + lightOffsetX,
    cy + lightOffsetY,
    radius * 0.18,
    cx,
    cy,
    radius
  )
  const surfaceStops = [
    `hsl(${hues[2] || hues[0]}, 95%, 75%)`,
    `hsl(${hues[3] || hues[1]}, 90%, 62%)`,
    `hsl(${hues[4] || hues[2]}, 85%, 48%)`,
    `hsl(${hues[5] || hues[3]}, 80%, 34%)`,
  ]
  surface.addColorStop(0, surfaceStops[0])
  surface.addColorStop(0.38, surfaceStops[1])
  surface.addColorStop(0.68, surfaceStops[2])
  surface.addColorStop(1, surfaceStops[3])

  ctx.fillStyle = surface
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const textureLumps = 140
  for (let i = 0; i < textureLumps; i += 1) {
    const px = cx + (rand() - 0.5) * radius * 2
    const py = cy + (rand() - 0.5) * radius * 2
    const pr = radius * (0.03 + rand() * 0.12)
    const ph = hues[(i * 7 + 1) % hues.length]
    const alpha = 0.08 + rand() * 0.18
    const lump = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr)
    lump.addColorStop(0, `hsla(${ph}, 85%, 60%, ${alpha})`)
    lump.addColorStop(1, `hsla(${ph}, 85%, 30%, 0)`)
    ctx.fillStyle = lump
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const cracks = 12
  for (let i = 0; i < cracks; i += 1) {
    const startAngle = rand() * Math.PI * 2
    const length = radius * (0.6 + rand() * 0.5)
    const sx = cx + Math.cos(startAngle) * radius * 0.1
    const sy = cy + Math.sin(startAngle) * radius * 0.1
    const ex = sx + Math.cos(startAngle + (rand() - 0.5) * 0.8) * length
    const ey = sy + Math.sin(startAngle + (rand() - 0.5) * 0.8) * length
    const c1x = sx + (rand() - 0.5) * radius * 0.6
    const c1y = sy + (rand() - 0.5) * radius * 0.6
    const c2x = ex + (rand() - 0.5) * radius * 0.6
    const c2y = ey + (rand() - 0.5) * radius * 0.6
    const ch = hues[(i * 5 + 4) % hues.length]
    ctx.strokeStyle = `hsla(${ch}, 90%, 70%, 0.16)`
    ctx.lineWidth = radius * (0.006 + rand() * 0.008)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const patchCount = 3 + Math.floor(rand() * 4)
  for (let i = 0; i < patchCount; i += 1) {
    const px = cx + (rand() - 0.5) * radius * 1.1
    const py = cy + (rand() - 0.5) * radius * 1.1
    const pr = radius * (0.22 + rand() * 0.35)
    const ph = hues[(i * 3 + 1) % hues.length]
    const ph2 = hues[(i * 3 + 2) % hues.length]
    const patchGrad = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr)
    patchGrad.addColorStop(0, `hsla(${ph}, 90%, 62%, 0.35)`)
    patchGrad.addColorStop(1, `hsla(${ph2}, 75%, 35%, 0)`)
    ctx.fillStyle = patchGrad
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Intentionally left without horizontal bands to avoid streaks.

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const terminator = ctx.createRadialGradient(
    cx + radius * 0.55,
    cy + radius * 0.1,
    radius * 0.2,
    cx + radius * 0.6,
    cy,
    radius * 1.1
  )
  terminator.addColorStop(0, 'rgba(0, 0, 0, 0)')
  terminator.addColorStop(1, 'rgba(0, 0, 0, 0.65)')
  ctx.fillStyle = terminator
  ctx.fillRect(0, 0, canvasSize, canvasSize)
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const auroraCount = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < auroraCount; i += 1) {
    const arcRadius = radius * (0.75 + rand() * 0.2)
    const arcWidth = radius * (0.18 + rand() * 0.12)
    const arcAngle = (rand() * 0.6 - 0.3)
    const arcX = cx + Math.cos(arcAngle) * radius * 0.15
    const arcY = cy - radius * (0.35 + rand() * 0.2)
    const auroraGrad = ctx.createRadialGradient(
      arcX,
      arcY,
      arcRadius * 0.2,
      arcX,
      arcY,
      arcRadius
    )
    const ah1 = hues[(i * 3 + 2) % hues.length]
    const ah2 = hues[(i * 3 + 3) % hues.length]
    auroraGrad.addColorStop(0, `hsla(${ah1}, 95%, 78%, 0.6)`)
    auroraGrad.addColorStop(1, `hsla(${ah2}, 95%, 68%, 0)`)
    ctx.strokeStyle = auroraGrad
    ctx.lineWidth = arcWidth
    ctx.beginPath()
    ctx.arc(arcX, arcY, arcRadius, Math.PI * 0.05, Math.PI * 0.95)
    ctx.stroke()

    const auroraGrad2 = ctx.createRadialGradient(
      arcX + radius * 0.06,
      arcY + radius * 0.04,
      arcRadius * 0.15,
      arcX + radius * 0.06,
      arcY + radius * 0.04,
      arcRadius * 0.85
    )
    const ah3 = hues[(i * 3 + 4) % hues.length]
    const ah4 = hues[(i * 3 + 5) % hues.length]
    auroraGrad2.addColorStop(0, `hsla(${ah3}, 98%, 82%, 0.55)`)
    auroraGrad2.addColorStop(1, `hsla(${ah4}, 95%, 70%, 0)`)
    ctx.strokeStyle = auroraGrad2
    ctx.lineWidth = arcWidth * 0.7
    ctx.beginPath()
    ctx.arc(arcX + radius * 0.05, arcY + radius * 0.03, arcRadius * 0.92, Math.PI * 0.1, Math.PI * 0.9)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const focusCount = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < focusCount; i += 1) {
    const fx = cx + (rand() - 0.5) * radius * 0.6
    const fy = cy + (rand() - 0.5) * radius * 0.6
    const fr = radius * (0.2 + rand() * 0.2)
    const fh = hues[(i * 4 + 4) % hues.length]
    const highlight = ctx.createRadialGradient(fx, fy, fr * 0.1, fx, fy, fr)
    highlight.addColorStop(0, `hsla(${fh}, 95%, 85%, 0.55)`)
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = highlight
    ctx.beginPath()
    ctx.arc(fx, fy, fr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const flareHue = hues[(hues.length - 2 + Math.floor(rand() * 3)) % hues.length]
  const flareCenterX = cx + (rand() - 0.5) * radius * 0.9
  const flareCenterY = cy + (rand() - 0.5) * radius * 0.9
  const flareRadius = radius * (0.35 + rand() * 0.2)
  const flareCore = ctx.createRadialGradient(
    flareCenterX,
    flareCenterY,
    flareRadius * 0.1,
    flareCenterX,
    flareCenterY,
    flareRadius
  )
  flareCore.addColorStop(0, `hsla(${flareHue}, 98%, 88%, 0.7)`)
  flareCore.addColorStop(0.5, `hsla(${flareHue}, 95%, 80%, 0.4)`)
  flareCore.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = flareCore
  ctx.beginPath()
  ctx.arc(flareCenterX, flareCenterY, flareRadius, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const riverCount = 3 + Math.floor(rand() * 3)
  for (let i = 0; i < riverCount; i += 1) {
    const startAngle = rand() * Math.PI * 2
    const endAngle = startAngle + (rand() * 1.2 - 0.6)
    const startR = radius * (0.1 + rand() * 0.6)
    const endR = radius * (0.1 + rand() * 0.6)
    const sx = cx + Math.cos(startAngle) * startR
    const sy = cy + Math.sin(startAngle) * startR
    const ex = cx + Math.cos(endAngle) * endR
    const ey = cy + Math.sin(endAngle) * endR
    const c1x = cx + (rand() - 0.5) * radius * 0.8
    const c1y = cy + (rand() - 0.5) * radius * 0.8
    const c2x = cx + (rand() - 0.5) * radius * 0.8
    const c2y = cy + (rand() - 0.5) * radius * 0.8
    const riverHue = hues[(i * 5 + 2) % hues.length]
    const riverHue2 = hues[(i * 5 + 3) % hues.length]
    const riverGrad = ctx.createLinearGradient(sx, sy, ex, ey)
    riverGrad.addColorStop(0, `hsla(${riverHue}, 95%, 78%, 0.25)`)
    riverGrad.addColorStop(0.5, `hsla(${riverHue2}, 98%, 82%, 0.35)`)
    riverGrad.addColorStop(1, `hsla(${riverHue}, 90%, 68%, 0.2)`)
    ctx.strokeStyle = riverGrad
    ctx.lineWidth = radius * (0.015 + rand() * 0.02)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = `hsla(${hues[6] || hues[2]}, 95%, 80%, 0.7)`
  ctx.lineWidth = Math.max(1, canvasSize * 0.02)
  ctx.shadowBlur = canvasSize * 0.08
  ctx.shadowColor = `hsla(${hues[7] || hues[3]}, 95%, 80%, 0.7)`
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  const bloomCanvas = document.createElement('canvas')
  bloomCanvas.width = canvasSize
  bloomCanvas.height = canvasSize
  const bloomCtx = bloomCanvas.getContext('2d')
  bloomCtx.drawImage(canvas, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.35
  ctx.filter = `blur(${canvasSize * 0.02}px)`
  ctx.drawImage(bloomCanvas, 0, 0)
  ctx.filter = 'none'
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.fillStyle = '#000'
  const noiseCount = Math.floor(canvasSize * canvasSize / 120)
  for (let i = 0; i < noiseCount; i += 1) {
    const x = rand() * canvasSize
    const y = rand() * canvasSize
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()

  const output = document.createElement('canvas')
  output.width = size
  output.height = size
  const outCtx = output.getContext('2d')
  outCtx.drawImage(canvas, 0, 0, canvasSize, canvasSize, 0, 0, size, size)
  return output.toDataURL()
}

export const visual = async (key, size = 256) => {
  const cacheKey = `${key || ''}:${size}`
  let dataUrl = cache.get(cacheKey)
  if (!dataUrl) {
    dataUrl = buildWorld(key, size)
    cache.set(cacheKey, dataUrl)
  }
  const img = new Image()
  img.src = dataUrl
  img.width = size
  img.height = size
  return img
}

*/
export {}
