import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@xterm/xterm/css/xterm.css';
import { App } from './App.jsx';
import { connectWs } from './lib/store.js';

connectWs();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
