import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { purgeLegacyData } from './prefs.js';
import './styles.css';

purgeLegacyData();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
