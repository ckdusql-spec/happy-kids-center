const CACHE_NAME = 'happy-kids-center-static-v2'
const STATIC_PATHS = new Set(['/manifest.json','/icon-192.png','/icon-512.png'])
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('happy-kids-center-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url)
  // Never cache attendance, API responses, HTML, or return HTML for a failed API request.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!STATIC_PATHS.has(url.pathname))return
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)))}
    return response
  }).catch(async()=> (await caches.match(event.request)) || Response.error()))
})
