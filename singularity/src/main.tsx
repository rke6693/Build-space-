import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './ui/App';

// iOS Safari ignores user-scalable=no; stop page pinch-zoom so two-finger gestures drive the
// 3D camera (touch-action on the canvas) instead of zooming the whole interface
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
