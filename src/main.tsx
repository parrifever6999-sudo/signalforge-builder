import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { boot } from './store/boot'
import { startAccess } from './access/access'
import './index.css'

// The pass is taken out of the address before the canvas reads it.
startAccess()
boot()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
