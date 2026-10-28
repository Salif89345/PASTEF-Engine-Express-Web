const CORE='pee-shell-a66a90b5ba28',CONTENT='pee-content-a66a90b5ba28';
const shell=["./", "index.html", "flutter_bootstrap.js", "flutter.js", "main.dart.js", "sqlite3.wasm", "pee-platform.js", "manifest.json", "offline-files.json", "icons/Icon-192.png", "canvaskit/canvaskit.js", "canvaskit/canvaskit.wasm", "canvaskit/chromium/canvaskit.js", "canvaskit/chromium/canvaskit.wasm", "assets/FontManifest.json", "assets/AssetManifest.bin.json", "assets/assets/data/programme_multisource.sqlite", "assets/fonts/MaterialIcons-Regular.otf", "assets/assets/fonts/roboto-regular.ttf", "assets/assets/fonts/roboto-medium.ttf", "assets/assets/fonts/roboto-bold.ttf", "assets/assets/fonts/roboto-black.ttf", "assets/assets/fonts/Caveat-Variable.ttf", "assets/assets/fonts/Montserrat-Variable.ttf", "assets/assets/fonts/Baloo2-Variable.ttf", "assets/assets/illustrations/topic_icons/topics-1.png", "assets/assets/illustrations/topic_icons/topics-2.png", "assets/assets/illustrations/topic_icons/topics-3.png", "assets/assets/illustrations/topic_icons/topics-4.png"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CORE).then(c=>c.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const key of await caches.keys())if((key.startsWith('pee-shell-')||key.startsWith('pee-content-'))&&key!==CORE&&key!==CONTENT)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==location.origin)return;
 e.respondWith((async()=>{
  if(e.request.mode==='navigate'){
   try {return await fetch(e.request);}
   catch (_) {return await (await caches.open(CORE)).match('./')||Response.error();}
  }
  const core=await caches.open(CORE),content=await caches.open(CONTENT);
  const hit=await core.match(e.request)||await content.match(e.request);if(hit)return hit;
  const response=await fetch(e.request);if(response.ok)await content.put(e.request,response.clone());return response;
 })());
});
