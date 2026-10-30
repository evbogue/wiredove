// Shared identity writes must preserve the previous-message chain even when two
// UI roots publish concurrently. Failures do not poison later operations.
let pending = Promise.resolve()
export const serializeWebsiteWrite = operation => {
  const result = pending.then(operation)
  pending = result.catch(() => {})
  return result
}
