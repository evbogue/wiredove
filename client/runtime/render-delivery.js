// Transitional delivery boundary for the existing shared transport session.
// UI roots subscribe explicitly; network modules never choose a document/root.
const renderers = new Set()
export const subscribeRenderer = renderer => {
  renderers.add(renderer)
  return () => renderers.delete(renderer)
}
export const deliverToRenderers = async (method, ...args) => {
  await Promise.all([...renderers].map(renderer => renderer[method](...args)))
}
