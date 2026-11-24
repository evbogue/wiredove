import { createRoot } from 'react-dom/client'
import { ResetPreview } from './ResetPreview'
import { resetRequested } from './reset-preview'
import { trackVisualViewport } from './visual-viewport'
import './index.css'

trackVisualViewport()

const root = createRoot(document.getElementById('root'))
if (resetRequested()) root.render(<ResetPreview />)
else void import('./App').then(({ default: App }) => root.render(<App />))
