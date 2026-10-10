import { render } from 'preact';
import { App } from '@/app/App';
import { registerPwa } from '@/app/providers/pwa';
import '@/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
render(<App />, root);
registerPwa();
