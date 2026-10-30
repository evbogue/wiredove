const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const getConnection = () => {
  if (typeof navigator === 'undefined') { return null }
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null
}

const getHardwareConcurrency = () => {
  if (typeof navigator === 'undefined') { return 4 }
  const value = Number(navigator.hardwareConcurrency)
  if (!Number.isFinite(value) || value <= 0) { return 4 }
  return value
}

export const adaptiveConcurrency = ({ base = 4, min = 1, max = 12, type = 'general' } = {}) => {
  let value = base
  const hardware = getHardwareConcurrency()
  const connection = getConnection()
  const saveData = Boolean(connection && connection.saveData)
  const effectiveType = connection && typeof connection.effectiveType === 'string' ? connection.effectiveType : ''
  const isSlowNet = effectiveType === 'slow-2g' || effectiveType === '2g'
  const isMidNet = effectiveType === '3g'

  if (hardware <= 2) {
    value -= 2
  } else if (hardware <= 4) {
    value -= 1
  } else if (hardware >= 12) {
    value += 2
  } else if (hardware >= 8) {
    value += 1
  }

  if (saveData) { value -= 2 }
  if (isSlowNet) {
    value -= 2
  } else if (isMidNet) {
    value -= 1
  }

  if (type === 'render' && hardware <= 4) {
    value -= 1
  }
  if (type === 'network' && hardware >= 8 && !saveData && !isSlowNet) {
    value += 1
  }

  return clamp(Math.round(value), min, max)
}
