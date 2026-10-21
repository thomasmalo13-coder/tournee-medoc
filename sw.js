let BUF=null;const SHELL='tfp-shell-m4-20261021',MAP='tfp-map-v1',FILES=["./", "index.html", "app.js", "data.enc.json", "manifest.json", "vendor/leaflet.css", "vendor/leaflet.js", "vendor/protomaps-leaflet.js", "fonts/fonts.css", "fonts/BarlowCondensed-600.woff2", "fonts/BarlowCondensed-700.woff2", "fonts/BarlowCondensed-800.woff2", "fonts/SourceSans3-400.woff2", "fonts/SourceSans3-600.woff2", "fonts/SourceSans3-700.woff2", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "vendor/images/layers-2x.png", "vendor/images/layers.png", "vendor/images/marker-icon-2x.png", "vendor/images/marker-icon.png", "vendor/images/marker-shadow.png"];
const NET=/\/(index\.html|app\.js|data\.enc\.json|manifest\.json)?$/;
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('tfp-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function mapResp(req){if(!BUF){const c=await caches.open(MAP);const full=await c.match('medoc.pmtiles');if(!full)return fetch(req);BUF=await full.arrayBuffer()}
 const range=req.headers.get('range');const buf=BUF;if(!range)return new Response(buf,{headers:{'Content-Type':'application/octet-stream'}});const m=/bytes=(\d+)-(\d*)/.exec(range);const s=+m[1],en=m[2]?Math.min(+m[2],buf.byteLength-1):buf.byteLength-1;
 return new Response(buf.slice(s,en+1),{status:206,headers:{'Content-Type':'application/octet-stream','Content-Range':`bytes ${s}-${en}/${buf.byteLength}`,'Content-Length':String(en-s+1),'Accept-Ranges':'bytes'}})}
const fromCache=req=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):undefined));
function netFirst(e){const req=e.request,u=new URL(req.url);u.search='';const key=u.pathname.endsWith('/')?new URL('index.html',u).href:u.href;
 const net=fetch(req,{cache:'no-store'}).then(r=>{if(r.ok){const cl=r.clone();e.waitUntil(caches.open(SHELL).then(c=>Promise.all([c.put(key,cl.clone()),key.endsWith('/index.html')?c.put(new URL('./',u).href,cl):0])))}return r});
 e.waitUntil(net.catch(()=>{}));
 const timeout=new Promise(res=>setTimeout(res,3000));
 return Promise.race([net.catch(()=>null),timeout.then(()=>null)]).then(async r=>{if(r&&r.ok)return r;const c=await fromCache(req);if(c)return c;if(r)return r;return net})}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET')return;
 if(u.pathname.endsWith('/medoc.pmtiles')){if(e.request.cache==='no-store'&&!e.request.headers.get('range'))return;e.respondWith(mapResp(e.request));return}
 if(e.request.mode==='navigate'||NET.test(u.pathname)){e.respondWith(netFirst(e));return}
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).catch(()=>caches.match('index.html'))))});
