const V='diet-v7';
const ASSETS=['./','index.html','styles.css','config.js','app.js','store.js','nag.js','assistant.js','foods.js','tips.js','vendor/supabase.js','fonts/q-latin.woff2','fonts/rr-cjk.woff2','fonts/script.woff2','manifest.json','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  // 网络优先，离线回退缓存
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))))});
// 定点催促提醒
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(x){}
  e.waitUntil(self.registration.showNotification(d.title||'轻盈日记',{body:d.body||'该记录今天吃了什么啦～',tag:d.tag||'nag',renotify:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png',data:{url:'./#log'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c){c.navigate&&c.navigate(u).catch(()=>{});return c.focus()}}return clients.openWindow(u)}))});
