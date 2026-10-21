function start(D){
const COL={"1er":"#00e5ff","2e":"#39ff88","3e":"#ffb020","4e":"#ff2bd6","5e":"#a66bff"};
const P=D.P,LAST=P.length-1;
const LS='tfp_medoc_';let mode=localStorage.getItem(LS+'mode')||'opt';let off=+(localStorage.getItem(LS+'off')||0);let night=localStorage.getItem(LS+'night')!=='0';
let done=JSON.parse(localStorage.getItem(LS+'done')||'{}');
const $=id=>document.getElementById(id);
['idep','ist'].forEach(k=>{const v=localStorage.getItem(LS+k);if(v!==null)$(k).value=v;$(k).addEventListener('input',()=>{localStorage.setItem(LS+k,$(k).value);calc();render()})});
const map=L.map('map',{zoomControl:false,preferCanvas:true,attributionControl:false});map.attributionControl=L.control.attribution({position:'topright',prefix:false}).addTo(map);
map.setMaxZoom(19);map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('itinéraire OSRM');let base=null;
function tiles(){if(base)map.removeLayer(base);base=protomapsL.leafletLayer({url:'medoc.pmtiles',flavor:night?'dark':'light',lang:'fr',maxDataZoom:14});base.addTo(map);$('btile').textContent=night?'☀ Carte jour':'🌙 Carte nuit'}
$('btile').onclick=()=>{night=!night;localStorage.setItem(LS+'night',night?'1':'0');tiles()};tiles();
map.on('popupopen',()=>$('leg').style.display='none');map.on('popupclose',()=>$('leg').style.display='');
$('leg').innerHTML=Object.entries(COL).map(([k,c])=>`<div><i style="background:${c};color:${c}"></i>${k} tour</div>`).join('');
const fmt=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const dur=s=>{const m=Math.round(s/60);return m>=60?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'):m+' min'};
const km=m=>(m/1000).toFixed(1).replace('.',',')+' km';
const exact=(m,s)=>Math.round(m).toLocaleString('fr-FR')+' m · '+Math.floor(s/60)+' min '+Math.round(s%60)+' s';
const wz=p=>`https://www.waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`;
const gm=p=>`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
const optNo={};D.modes.opt.seq.forEach((pi,k)=>{if(P[pi].num)optNo[P[pi].num]=k});
let T=[],LT=[],layer=L.layerGroup().addTo(map),markers={},cur=null;
const avg=l=>l.ls>0?l.m/l.ls*3.6:0;
const legT=l=>{if(!off||!(l.s>0))return l.s;const v=l.m/l.s*3.6+off;return l.m/(v/3.6)};
function calc(){const M=D.modes[mode],[h,mi]=($('idep').value||'01:30').split(':').map(Number);let t=h*60+mi,sm=+$('ist').value||0,drive=0;T=[];LT=M.legs.map(legT);
 M.seq.forEach((pi,k)=>{if(k>0){t+=LT[k-1]/60;drive+=LT[k-1]}T.push(t);if(k>0&&k<LAST)t+=sm});
 $('sk').textContent=(M.m/1000).toFixed(1);$('sd').textContent=dur(drive);$('st').textContent=dur(drive+sm*60*(LAST-1));$('se').textContent=fmt(T[LAST]);
 document.querySelectorAll('#spd button').forEach(b=>b.classList.toggle('on',+b.dataset.o==off));}
function label(k){return String(k).padStart(2,'0')}
function legInfo(k){const l=D.modes[mode].legs[k-1];return `<div><b style="color:#00f0ff">Arrivée ${fmt(T[k])}</b> · trajet ${dur(LT[k-1])}</div><div class="rd">${l.r.join(' → ')}</div><div class="ex">${l.b?'Moy. autorisée':'Moy. (OSRM)'} ${Math.round(avg(l))} km/h · ${km(l.m)}</div>`}
function popup(k){const M=D.modes[mode],p=P[M.seq[k]];
 if(!p.num)return `<div class="pp"><h3>${p.name}</h3><div class="mu">${p.addr}</div>${k==0?'<div>Départ '+fmt(T[0])+'</div>':legInfo(k)}<div class="row"><a class="wz" href="${wz(p)}">Waze</a></div></div>`;
 return `<div class="pp"><h3>${label(k)} · Pharmacie ${p.name}</h3><div class="mu">${p.town} · ${p.round} tour${mode=='cur'?' · opt. '+label(optNo[p.num]):''}</div>${p.approx?'<div class="ap">(position approximative)</div>':''}
 <div class="ins">${p.ins}</div>${legInfo(k)}
 <div class="row"><a class="wz" href="${wz(p)}">Waze — Y aller</a><button class="bt" onclick="tog('${p.num}')">${done[p.num]?'Annuler':'Fait ✓'}</button></div><a class="gm" href="${gm(p)}">Google Maps</a></div>`}
function nextK(){const M=D.modes[mode];for(let k=1;k<LAST;k++)if(!done[P[M.seq[k]].num])return k;return LAST}
function render(){layer.clearLayers();markers={};const M=D.modes[mode];
 M.legs.forEach((l,k)=>{const p=P[M.seq[k+1]],c=p.round?COL[p.round]:'#c9c3ff';L.polyline(l.g,{color:c,weight:14,opacity:.22,interactive:false}).addTo(layer);L.polyline(l.g,{color:c,weight:4.5,opacity:1,interactive:false}).addTo(layer)});
 M.seq.forEach((pi,k)=>{const p=P[pi];let html;
  if(!p.num)html=`<div class="mk sq" style="--c:#ff2bd6">${k==0?'D':'🏠'}</div>`;else html=done[p.num]?`<div class="mk done">✓</div>`:`<div class="mk" style="background:${COL[p.round]};--c:${COL[p.round]};color:#07060f">${label(k)}</div>`;
  markers[k]=L.marker([p.lat,p.lon],{icon:L.divIcon({html,className:'',iconSize:[32,32],iconAnchor:[16,16]}),zIndexOffset:p.num?0:1000}).bindPopup(()=>popup(k),{maxWidth:300,autoPanPaddingTopLeft:L.point(10,10),autoPanPaddingBottomRight:L.point(10,300)}).addTo(layer)});
 $('list').innerHTML=M.seq.map((pi,k)=>{const p=P[pi],c=p.round?COL[p.round]:'#ff2bd6';return `<div class="it${p.num&&done[p.num]?' done':''}" onclick="go(${k})"><div class="n" style="background:${c};--c:${c};color:#07060f">${p.num?(done[p.num]?'✓':label(k)):(k?'🏠':'D')}</div><div class="t"><b>${p.num?'Pharmacie '+p.name:p.name}</b><br><small>${p.town||p.addr}</small></div><div class="h">${fmt(T[k])}</div></div>`}).join('');
 if(cur===null||cur<1||cur>LAST||(P[M.seq[cur]].num&&done[P[M.seq[cur]].num]))cur=nextK();card();
 document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.m==mode));}
function card(){const M=D.modes[mode],k=cur,p=P[M.seq[k]],nd=Object.keys(done).filter(x=>done[x]).length,l=M.legs[k-1],c=p.round?COL[p.round]:'#ff2bd6';
 $('card').innerHTML=`<div class="row" onclick="go(${k})"><div class="n" style="background:${c};--c:${c};color:#07060f;width:44px;height:44px;font-size:20px">${p.num?label(k):'🏠'}</div><div class="nm"><div class="kick">Prochain arrêt · ${nd}/${LAST-1} faits</div><div class="pn">${p.num?p.name:'Arrivée maison'}</div><div class="tw">${p.town||p.addr}</div></div><div class="eta"><b>${fmt(T[k])}</b><small>${dur(LT[k-1])}</small></div></div>
 ${p.num?`<div class="ins">${p.ins}</div>`:''}<div class="rd">${l.r.join(' → ')}</div>
 <div class="row" style="margin-top:10px"><a class="wz" href="${wz(p)}">➤ WAZE</a>${p.num?`<button class="bt ok" onclick="tog('${p.num}',1)">✓ Fait</button>`:''}<button class="bt" onclick="nx()">Suivant ›</button></div>`}
function go(k){$('list').classList.remove('on');cur=k;card();const p=P[D.modes[mode].seq[k]];map.setView([p.lat,p.lon],16,{animate:false});map.panBy([0,Math.round($('card').offsetHeight/2)],{animate:false});setTimeout(()=>markers[k].openPopup(),250)}
function tog(n,adv){done[n]=!done[n];localStorage.setItem(LS+'done',JSON.stringify(done));map.closePopup();if(adv||done[n])cur=nextK();render()}
function nx(){const M=D.modes[mode];let k=cur;do{k=k%LAST+1}while(k<LAST&&done[P[M.seq[k]].num]&&k!=cur);cur=k;card();const p=P[M.seq[k]];map.panTo([p.lat,p.lon])}
const caps=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function loadView(){const s=D.modes.opt.seq.filter(pi=>P[pi].num).map(pi=>P[pi]).reverse();
 $('lbody').innerHTML=s.map(p=>`<div class="r"><div><b class="big">${caps(p.name)}</b><br><small>${p.town}</small> <span class="lv">livrée en ${optNo[p.num]}<sup>e</sup></span></div></div>`).join('');document.body.classList.add('ld')}
$('bload').onclick=loadView;
$('bl').onclick=()=>$('list').classList.toggle('on');$('bs').onclick=()=>$('set').classList.toggle('on');
$('reset').onclick=()=>{if(confirm('Effacer les arrêts faits ?')){done={};localStorage.setItem(LS+'done','{}');cur=null;render()}};
document.querySelectorAll('#spd button').forEach(b=>b.onclick=()=>{off=+b.dataset.o;localStorage.setItem(LS+'off',off);calc();render()});
document.querySelectorAll('#seg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;localStorage.setItem(LS+'mode',mode);cur=null;calc();render()});
Object.assign(window,{go,tog,nx,loadView});calc();render();map.fitBounds(L.latLngBounds(P.map(p=>[p.lat,p.lon])),{padding:[20,20]});
}

const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function decrypt(pass){const E=await (await fetch('data.enc.json')).json();
 const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(E.salt),iterations:E.iter,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(E.iv)},key,b64(E.ct));return JSON.parse(new TextDecoder().decode(pt))}
async function unlock(pass,auto){$$('lerr').textContent=auto?'':'Déchiffrement…';try{const D=await decrypt(pass);localStorage.setItem('tfp_pass',pass);document.body.classList.remove('locked');$$('lock').remove();start(D);offlineMap()}catch(e){if(auto){localStorage.removeItem('tfp_pass');$$('lerr').textContent=''}else $$('lerr').textContent='Code incorrect.';console.log(e)}}
const $$=id=>document.getElementById(id);
$$('unl').onclick=()=>unlock($$('pin').value.trim());$$('pin').onkeydown=e=>{if(e.key==='Enter')unlock($$('pin').value.trim())};
if(localStorage.getItem('tfp_pass'))unlock(localStorage.getItem('tfp_pass'),true);
async function offlineMap(){if(!('caches' in window))return;const c=await caches.open('tfp-map-v1');if(await c.match('medoc.pmtiles'))return;
 const el=$$('dl');el.classList.add('on');try{const r=await fetch('medoc.pmtiles',{cache:'no-store'});const tot=+r.headers.get('content-length')||22809232;const rd=r.body.getReader();let got=0,parts=[];
 for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;const p=Math.min(100,Math.floor(got*100/tot));$$('dlp').textContent=p;$$('dlb').style.width=p+'%'}
 await c.put('medoc.pmtiles',new Response(new Blob(parts),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(got)}}));el.innerHTML='✓ Carte hors ligne prête';setTimeout(()=>el.classList.remove('on'),2500)}
 catch(e){el.textContent='Carte hors ligne : échec, réessai au prochain lancement';setTimeout(()=>el.classList.remove('on'),4000)}}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
