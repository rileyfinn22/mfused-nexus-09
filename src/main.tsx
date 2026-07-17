import { createRoot } from 'react-dom/client'
import { installFetchTimeout } from './lib/installFetchTimeout.ts'
import App from './App.tsx'
import './index.css'

installFetchTimeout();

createRoot(document.getElementById("root")!).render(<App />);
