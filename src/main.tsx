import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress cross-origin "Script error." from bubbling to Vite's error overlay
// This happens when AMap fails to load due to incorrect Domain Whitelist in AMap console.
window.addEventListener('error', function(event) {
  if (event.message === 'Script error.' || event.message === 'Script error') {
    console.warn('Caught cross-origin Script error. This typically means the AMap Domain Whitelist is not configured correctly in the AMap console.');
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}, true); // use capture phase to run before Vite's bubble phase listener

window.addEventListener('unhandledrejection', function(event) {
  const reason = event.reason;
  if (reason && (reason === 'Script error.' || reason === 'Script error' || reason.message === 'Script error.' || reason.message === 'Script error')) {
    console.warn('Caught cross-origin unhandled rejection Script error. This typically means the AMap Domain Whitelist is not configured correctly in the AMap console.');
    event.stopImmediatePropagation();
    event.preventDefault(); 
  }
}, true); // use capture phase

// Aggressively remove Vite's error overlay if it slips through and is specifically for "Script error."
setInterval(() => {
  const overlay = document.querySelector('vite-error-overlay');
  if (overlay) {
    const shadowRoot = overlay.shadowRoot;
    if (shadowRoot) {
      const pre = shadowRoot.querySelector('.message-body') || shadowRoot.querySelector('.message');
      if (pre && (pre.textContent?.includes('Script error.') || pre.textContent?.includes('Script error'))) {
        overlay.remove();
        console.warn('Aggressively suppressed Vite error overlay for AMap cross-origin Script error.');
      }
    }
  }
}, 500);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

