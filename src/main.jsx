import React from 'react'
import { createRoot } from 'react-dom/client'
// 書体は自前で配信（CSPで外部読み込みを禁止しているため）。必要な文字の分だけ自動で読み込まれる
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/500.css'
import '@fontsource/zen-kaku-gothic-new/700.css'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)
