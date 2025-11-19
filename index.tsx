import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

console.log(" [System] Boot sequence initiated...");

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error(" [System] FATAL: Root element not found.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <HashRouter>
            <App />
          </HashRouter>
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log(" [System] React mounted successfully.");
  } catch (e) {
    console.error(" [System] React mount failed:", e);
    rootElement.innerHTML = `<div style="color:red; padding:20px;"><h1>CRASH</h1><pre>${e}</pre></div>`;
  }
}