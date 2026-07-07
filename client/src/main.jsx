import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { SPORT, BRAND } from './sport.js';
import './styles.css';

// Apply the sport theme + branding before first paint (no flash).
document.documentElement.dataset.sport = SPORT;
document.title = BRAND.name;
const themeMeta = document.querySelector('meta[name="theme-color"]');
if (themeMeta) themeMeta.setAttribute('content', BRAND.themeColor);

createRoot(document.getElementById('root')).render(<App />);
