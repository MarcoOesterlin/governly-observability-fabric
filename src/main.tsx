import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@phosphor-icons/web/regular';
import './index.css';

import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers';
import { initRuntimeClient } from './data/client';

void initRuntimeClient().finally(() => {
  createRoot(document.getElementById('root')!).render(<Providers />);
});

