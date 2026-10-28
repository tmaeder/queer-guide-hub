import './index.css';
import { healBootAssets } from './utils/assetHeal';

async function loadApplication() {
  try {
    await import('./app-bootstrap');
  } catch (error) {
    // The application graph may be stale after a deployment. Its own recovery
    // listeners cannot run if importing that graph failed, so heal it here.
    console.error('Unable to start Queer Guide', error);
    const url = new URL(window.location.href);
    if (url.searchParams.has('__fresh')) return;
    await healBootAssets();
    url.searchParams.set('__fresh', String(Date.now()));
    window.location.replace(url.toString());
  }
}

function startApplication() {
  const root = document.getElementById('root');
  if (root?.hasChildNodes() && document.visibilityState === 'visible') {
    // Pages already supplies useful introductory text and navigation. Give
    // that document one rendering opportunity before enhancing it with React.
    // No delay is needed for an empty development shell or a background tab.
    requestAnimationFrame(() => requestAnimationFrame(() => void loadApplication()));
  } else {
    void loadApplication();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication, { once: true });
} else {
  startApplication();
}
