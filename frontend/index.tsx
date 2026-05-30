import './index.css';
import './styles/jimeng.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SiteAccessGate from './SiteAccessGate';
import { JimengAuthProvider } from './integrations/jimeng/JimengAuthProvider';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SiteAccessGate>
      <JimengAuthProvider>
        <App />
      </JimengAuthProvider>
    </SiteAccessGate>
  </React.StrictMode>
);
