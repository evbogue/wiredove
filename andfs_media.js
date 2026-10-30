// Compatibility entry point for the original local media adapter.
// Keep uploads and verified rendering on the shared upstream implementation.
export { storeMedia as storeAndFS } from './media.js'
export { renderAndFSMedia } from './client/ui/media-render.js'
