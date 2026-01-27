import { apds } from 'apds'

const MOD_KEY = 'moderation'
const DEFAULT_STATE = {
  mutedAuthors: [],
  hiddenHashes: [],
  mutedWords: [],
  blockedAuthors: []
}

let cachedState = null
let cachedAt = 0
const CACHE_TTL_MS = 2000

const uniq = (list) => Array.from(new Set(list))

const cleanList = (list) => uniq(
  (Array.isArray(list) ? list : [])
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
)

const normalizeState = (state) => {
  const base = state && typeof state === 'object' ? state : {}
  return {
    mutedAuthors: cleanList(base.mutedAuthors),
    hiddenHashes: cleanList(base.hiddenHashes),
    mutedWords: cleanList(base.mutedWords).map(word => word.toLowerCase()),
    blockedAuthors: cleanList(base.blockedAuthors)
  }
}

const parseState = (raw) => {
  if (!raw) { return normalizeState(DEFAULT_STATE) }
  try {
    return normalizeState(JSON.parse(raw))
  } catch {
    return normalizeState(DEFAULT_STATE)
  }
}

export const splitTextList = (text) => {
  if (!text) { return [] }
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

export const getModerationState = async () => {
  const now = Date.now()
  if (cachedState && now - cachedAt < CACHE_TTL_MS) {
    return cachedState
  }
  const stored = await apds.get(MOD_KEY)
  cachedState = parseState(stored)
  cachedAt = now
  return cachedState
}

export const saveModerationState = async (nextState) => {
  const normalized = normalizeState(nextState)
  cachedState = normalized
  cachedAt = Date.now()
  await apds.put(MOD_KEY, JSON.stringify(normalized))
  return normalized
}

const updateState = async (updateFn) => {
  const current = await getModerationState()
  return saveModerationState(updateFn(current))
}

export const addMutedAuthor = async (author) => {
  if (!author) { return getModerationState() }
  return updateState(state => ({
    ...state,
    mutedAuthors: uniq([...state.mutedAuthors, author])
  }))
}

export const removeMutedAuthor = async (author) => {
  if (!author) { return getModerationState() }
  return updateState(state => ({
    ...state,
    mutedAuthors: state.mutedAuthors.filter(item => item !== author)
  }))
}

export const addBlockedAuthor = async (author) => {
  if (!author) { return getModerationState() }
  const next = await updateState(state => ({
    ...state,
    blockedAuthors: uniq([...state.blockedAuthors, author])
  }))
  let purge = null
  if (typeof apds.purgeAuthor === 'function') {
    purge = await apds.purgeAuthor(author)
  }
  return { state: next, purge }
}

export const removeBlockedAuthor = async (author) => {
  if (!author) { return getModerationState() }
  return updateState(state => ({
    ...state,
    blockedAuthors: state.blockedAuthors.filter(item => item !== author)
  }))
}

export const addHiddenHash = async (hash) => {
  if (!hash) { return getModerationState() }
  return updateState(state => ({
    ...state,
    hiddenHashes: uniq([...state.hiddenHashes, hash])
  }))
}

export const removeHiddenHash = async (hash) => {
  if (!hash) { return getModerationState() }
  return updateState(state => ({
    ...state,
    hiddenHashes: state.hiddenHashes.filter(item => item !== hash)
  }))
}

export const shouldHideMessage = async ({ author, hash, body }) => {
  const state = await getModerationState()
  if (author && state.blockedAuthors.includes(author)) {
    return { hidden: true, reason: 'Blocked author', code: 'blocked-author' }
  }
  if (author && state.mutedAuthors.includes(author)) {
    return { hidden: true, reason: 'Muted author', code: 'muted-author' }
  }
  if (hash && state.hiddenHashes.includes(hash)) {
    return { hidden: true, reason: 'Hidden message', code: 'hidden-hash' }
  }
  if (body && state.mutedWords.length) {
    const lowered = body.toLowerCase()
    for (const word of state.mutedWords) {
      if (word && lowered.includes(word)) {
        return { hidden: true, reason: 'Filtered keyword', code: 'muted-word', word }
      }
    }
  }
  return { hidden: false }
}

export const isBlockedAuthor = async (author) => {
  if (!author || author.length !== 44) { return false }
  const state = await getModerationState()
  return state.blockedAuthors.includes(author)
}
