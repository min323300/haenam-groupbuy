// 해남공구마켓 홈 화면 앱용 서비스워커
// 캐시하지 않습니다. 항상 최신 상품·가격을 인터넷에서 그대로 불러옵니다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
