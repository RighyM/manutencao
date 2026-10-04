// Necessário para instalar o app na tela inicial. Sempre busca a versão mais nova na internet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
