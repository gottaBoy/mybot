import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {PreviewRunner} from './PreviewRunner'
import '../styles.css'
import '../playground/playground.css'

createRoot(document.getElementById('root')!).render(<StrictMode><PreviewRunner /></StrictMode>)
