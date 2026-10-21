/* ===== Trafic du matin — ESTIMATION, constantes modifiables =====
   Bandes : [début en minutes depuis 00:00, facteur appliqué à la durée OSRM du tronçon]
   Le facteur est lu à l'heure du milieu du tronçon. Intensité : l'excédent (facteur-1) est multiplié par 0,5 / 1 / 1,5. */
const TRAFFIC={
 START:'05:30',
 // Zone « Bordeaux nord / rocade » : boîte lat/lon (Le Haillan, Eysines, Blanquefort, St-Médard, Le Taillan, St-Aubin, Bruges/Bordeaux) + tronçons empruntant la rocade A630/N230
 BN_BOX:{latMin:44.78,latMax:44.935,lonMin:-0.77,lonMax:-0.50},
 BN:[[0,1.0],[330,1.3],[390,1.6],[420,2.0],[570,1.4],[1200,1.0]],   // <05:30 ×1 · 05:30 ×1.3 · 06:30 ×1.6 · 07:00–09:30 ×2 · après ×1.4 · 20:00+ ×1
 // Descente du Médoc vers Bordeaux (couloir estuaire D2/D1215 Verdon → Lesparre → Castelnau) : arrivée plus au sud d'au moins 0,05° de latitude
 MS_DLAT:-0.05,
 MS_POLY:[[45.62,-1.13],[45.45,-1.06],[45.38,-1.02],[45.30,-0.98],[45.10,-0.90],[44.935,-0.88],[44.935,-0.50],[45.62,-0.50]],
 MS:[[0,1.0],[330,1.15],[390,1.3],[540,1.15],[1200,1.0]],          // <05:30 ×1 · 05:30 ×1.15 · 06:30–09:00 ×1.3 · après ×1.15
 INT:[0.5,1,1.5], INT_LBL:['faible','normale','forte'],
 BUDGET_MS:700   // temps max du solveur (téléphone)
};
const AREAS={bx:['Banlieue de Bordeaux','#00e5ff'],md:['Médoc estuaire','#39ff88'],ct:['Côte & forêt','#ffb020']};
const COAST_NUMS=['23','24','25','26','27','28'],MONT_NUM='23';
const MODES={best:'⚡ Meilleur (trafic)',medoc:'Médoc↑Côte↓',cur:'Ordre actuel'};

/* ===== Solveur (exécuté dans un Web Worker ; repli dans la page) ===== */
function SOLVER(){
 let C=null;
 function init(c){C=c}
 function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function solve(q){
  const t0=Date.now(),N=C.N,E=N-1,S=q.S,Z=C.Z,dep=q.dep,stop=q.stop,nodes=q.nodes.slice(),n=nodes.length;
  const band=(B,m)=>{let f=1;for(const b of B){if(m>=b[0])f=b[1];else break}return f};
  const LUT=[null,new Float64Array(1440),new Float64Array(1440)];
  for(let m=0;m<1440;m++){LUT[1][m]=q.tr?1+(band(C.BN,m)-1)*q.k:1;LUT[2][m]=q.tr?1+(band(C.MS,m)-1)*q.k:1}
  const leg=(a,b,t)=>{const i=a*N+b,s=S[i],z=Z[i];return z?s*LUT[z][(Math.floor((t+s/2)/60)%1440+1440)%1440]:s};
  const isC=new Uint8Array(N);(q.coast||[]).forEach(c=>isC[c]=1);const tip=q.tip??-1,first=q.first??-1,MED=q.mode==='medoc';
  const pen=x=>{if(!MED)return 0;let v=0,sT=tip<0,sF=first<0;for(let i=0;i<x.length;i++){const c=x[i];if(c===tip)sT=true;if(isC[c]){if(!sT)v++;if(c!==first&&!sF)v++;if(c===first)sF=true}}return v*1e7};
  const tl=x=>{const seq=[0,...x,E],tm=[dep],lt=[];let t=dep;for(let i=1;i<seq.length;i++){const d=leg(seq[i-1],seq[i],t);lt.push(d);t+=d;tm.push(t);if(i<seq.length-1)t+=stop}return{seq,tm,lt}};
  const full0=x=>{let t=dep,p=0;for(let i=0;i<x.length;i++){t+=leg(p,x[i],t)+stop;p=x[i]}return t+leg(p,E,t)+pen(x)};
  if(q.mode==='fixed'||n<2)return Object.assign(tl(nodes),{cost:full0(nodes),it:0});
  // --- recherche locale rapide : tableaux typés + évaluation partielle (seul le tronçon modifié est recalculé)
  const X=new Int16Array(n),Y=new Int16Array(n),pref=new Float64Array(n);let cost=0;
  const full=x=>{let t=dep,p=0;for(let i=0;i<n;i++){t+=leg(p,x[i],t)+stop;p=x[i];pref[i]=t}return t+leg(p,E,t)+pen(x)};
  // temps après la position hi+1 de Y (préfixe identique à X jusqu'à lo-1) ; compare au même point de X
  const part=(lo,hi)=>{let t=lo>0?pref[lo-1]:dep,p=lo>0?Y[lo-1]:0;const e=Math.min(hi+1,n-1);for(let i=lo;i<=e;i++){t+=leg(p,Y[i],t)+stop;p=Y[i]}return hi+1>=n?[t+leg(p,E,t),cost-pen(X)]:[t,pref[e]]};
  const tryY=(lo,hi)=>{const[a,b]=part(lo,hi);if(a<b-1e-6){const c=full(Y);if(c<cost-1e-6){X.set(Y);cost=c;full(X);return true}full(X)}return false};
  function ls(){cost=full(X);let imp=true,g=0;
   while(imp&&g++<500){imp=false;
    for(let L=1;L<=Math.min(6,n-1)&&!imp;L++)for(let i=0;i+L<=n&&!imp;i++)for(let j=0;j<=n-L&&!imp;j++){if(j===i)continue;
     for(let r=0;r<(L>1?2:1)&&!imp;r++){ // retire X[i..i+L) et le réinsère pour qu'il commence à j dans Y
      let w=0;const seg=k=>r?X[i+L-1-k]:X[i+k];
      if(j<i){for(let k=0;k<j;k++)Y[w++]=X[k];for(let k=0;k<L;k++)Y[w++]=seg(k);for(let k=j;k<i;k++)Y[w++]=X[k];for(let k=i+L;k<n;k++)Y[w++]=X[k];imp=tryY(j,i+L-1)}
      else{for(let k=0;k<i;k++)Y[w++]=X[k];for(let k=i+L;k<j+L;k++)Y[w++]=X[k];for(let k=0;k<L;k++)Y[w++]=seg(k);for(let k=j+L;k<n;k++)Y[w++]=X[k];imp=tryY(i,j+L-1)}}}
    for(let i=0;i<n-1&&!imp;i++)for(let k=i+1;k<n&&!imp;k++){Y.set(X);for(let a=i,b=k;a<b;a++,b--){const t=Y[a];Y[a]=Y[b];Y[b]=t}imp=tryY(i,k)}}
   return cost}
  let best=null,bc=Infinity;
  if(q.mode==='best'&&n<=11){const M=1<<n,dp=new Float64Array(M*n).fill(Infinity),pr=new Int16Array(M*n).fill(-1);
   for(let j=0;j<n;j++)dp[(1<<j)*n+j]=dep+leg(0,nodes[j],dep)+stop;
   for(let m=1;m<M;m++)for(let j=0;j<n;j++){const v=dp[m*n+j];if(!(m>>j&1)||v===Infinity)continue;for(let k=0;k<n;k++){if(m>>k&1)continue;const w=v+leg(nodes[j],nodes[k],v)+stop,id=(m|1<<k)*n+k;if(w<dp[id]){dp[id]=w;pr[id]=j}}}
   let bj=0,bv=Infinity;for(let j=0;j<n;j++){const v=dp[(M-1)*n+j];const w=v+leg(nodes[j],E,v);if(w<bv){bv=w;bj=j}}
   const x=[];let m=M-1,j=bj;while(j>=0){x.unshift(nodes[j]);const pj=pr[m*n+j];m&=~(1<<j);j=pj}best=x;bc=full0(x)}
  const R=rng(q.rseed||20261021),cands=[];const has=new Set(nodes);
  (q.seeds||[]).forEach(s=>{const f=s.filter(v=>has.has(v));if(f.length===n){cands.push(f);cands.push(f.slice().reverse())}});
  if(q.groups){const G=q.groups; // graines structurelles : blocs de zones dans des ordres différents
   for(const order of q.groupOrders){const x=[];for(const g of order){const blk=(G[g.z]||[]).filter(v=>has.has(v));x.push(...(g.rev?blk.slice().reverse():blk))}if(x.length===n)cands.push(x)}}
  {const x=[nodes.reduce((a,b)=>S[b]<S[a]?b:a)];const left=new Set(nodes);left.delete(x[0]);
   while(left.size){let bv=Infinity,bn=-1,bp=0;for(const v of left)for(let p=0;p<=x.length;p++){const a=p?x[p-1]:0,b=p<x.length?x[p]:E;const d=S[a*N+v]+S[v*N+b]-S[a*N+b];if(d<bv){bv=d;bn=v;bp=p}}x.splice(bp,0,bn);left.delete(bn)}cands.push(x)}
  const seen=[];
  for(const c0 of cands){if(MED&&pen(c0))continue;X.set(c0);const c=ls();seen.push(c);if(c<bc){bc=c;best=Array.from(X)}}
  if(!best){X.set(cands[0]);bc=ls();best=Array.from(X)}
  // --- ILS : double-pont + inversion, acceptation légèrement dégradante, retour au meilleur
  let it=0,curC=bc;const CUR=Int16Array.from(best),maxIt=q.maxIt||3000;let stall=0;
  while(it<maxIt&&Date.now()-t0<q.budget&&n>=8){it++;
   let ok=false;for(let tries=0;tries<12&&!ok;tries++){
    const a=1+Math.floor(R()*(n-3)),b=a+1+Math.floor(R()*(n-a-2)),c=b+1+Math.floor(R()*(n-b-1));let w=0;
    for(let k=0;k<a;k++)Y[w++]=CUR[k];for(let k=b;k<c;k++)Y[w++]=CUR[k];for(let k=a;k<b;k++)Y[w++]=CUR[k];for(let k=c;k<n;k++)Y[w++]=CUR[k];
    if(R()<0.4){const i=Math.floor(R()*(n-1)),k=Math.min(n-1,i+2+Math.floor(R()*6));for(let x=i,y=k;x<y;x++,y--){const t=Y[x];Y[x]=Y[y];Y[y]=t}}
    ok=!MED||!pen(Y)}
   if(!ok)continue;X.set(Y);const c=ls();
   if(c<bc-1e-6){bc=c;best=Array.from(X);stall=0}else stall++;
   if(c<curC+30*R()){CUR.set(X);curC=c}
   if(stall>60){CUR.set(best);curC=bc;stall=0}}
  return Object.assign(tl(best),{cost:bc,it,pen:pen(best)})}
 return{init,solve}}

function start(D){
const P=D.P,N=P.length,E=N-1;
const LS='tfp_medoc_';let mode=localStorage.getItem(LS+'mode5')||'best';if(!MODES[mode])mode='best';
let off=+(localStorage.getItem(LS+'off')||0);let night=localStorage.getItem(LS+'night')!=='0';
let tr=localStorage.getItem(LS+'traffic')!=='0',ti=+(localStorage.getItem(LS+'tint')??1);if(!(ti>=0&&ti<=2))ti=1;
let done=JSON.parse(localStorage.getItem(LS+'done')||'{}');let open=localStorage.getItem(LS+'card')==='1';
const $=id=>document.getElementById(id);
const idxOf={};P.forEach((p,i)=>{if(p.num)idxOf[p.num]=i});
const STOPS=P.map((p,i)=>i).filter(i=>P[i].num);
// --- zones trafic par tronçon (calculées une fois)
const inBox=(la,lo)=>{const b=TRAFFIC.BN_BOX;return la>=b.latMin&&la<=b.latMax&&lo>=b.lonMin&&lo<=b.lonMax};
const inPoly=(la,lo,pg)=>{let c=false;for(let i=0,j=pg.length-1;i<pg.length;j=i++){const[yi,xi]=pg[i],[yj,xj]=pg[j];if((yi>la)!==(yj>la)&&lo<(xj-xi)*(la-yi)/(yj-yi)+xi)c=!c}return c};
const Z=new Uint8Array(N*N);
for(let a=0;a<N;a++)for(let b=0;b<N;b++){const k=a*N+b,m=D.M[k];if(a===b||!m)continue;
 if(inBox(P[a].lat,P[a].lon)||inBox(P[b].lat,P[b].lon)||inBox(m[0],m[1])||D.K[k])Z[k]=1;
 else if(P[b].lat-P[a].lat<TRAFFIC.MS_DLAT&&inPoly(m[0],m[1],TRAFFIC.MS_POLY))Z[k]=2}
// --- solveur
let W=null,FB=null,reqId=0;const pending={};
try{const src='const S=('+SOLVER.toString()+')();onmessage=e=>{const m=e.data;if(m.init){S.init(m.init);return}const t=performance.now();const r=S.solve(m);r.ms=performance.now()-t;r.id=m.id;postMessage(r)}';
 W=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));W.onmessage=e=>{const r=e.data,f=pending[r.id];delete pending[r.id];if(f)f(r)};W.onerror=()=>{W=null}}catch(e){W=null}
const INIT={N,Z,BN:TRAFFIC.BN,MS:TRAFFIC.MS};if(W)W.postMessage({init:INIT});
function runSolver(q){return new Promise(res=>{if(W){q.id=++reqId;pending[q.id]=res;W.postMessage(q)}else{if(!FB){FB=SOLVER();FB.init(INIT)}const t=performance.now(),r=FB.solve(q);r.ms=performance.now()-t;res(r)}})}
// --- sélection du soir (par jour de tournée = date de maintenant − 12 h)
const day=(d=0)=>{const t=new Date(Date.now()-12*3600e3-d*86400e3);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')};
let SEL=JSON.parse(localStorage.getItem(LS+'sel')||'{}');
const selNums=()=>SEL[day()]||SEL._last||STOPS.map(i=>P[i].num);
let sel=new Set(selNums().filter(n=>idxOf[n]!==undefined).map(n=>idxOf[n]));
function saveSel(nums){SEL[day()]=nums;SEL._last=nums;const ks=Object.keys(SEL).filter(k=>k!=='_last').sort();while(ks.length>10)delete SEL[ks.shift()];localStorage.setItem(LS+'sel',JSON.stringify(SEL))}
// --- carte
const map=L.map('map',{zoomControl:false,preferCanvas:true,attributionControl:false});map.attributionControl=L.control.attribution({position:'topright',prefix:false}).addTo(map);
map.setMaxZoom(19);map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('itinéraire OSRM');let base=null;
function tiles(){if(base)map.removeLayer(base);base=protomapsL.leafletLayer({url:'medoc.pmtiles',flavor:night?'dark':'light',lang:'fr',maxDataZoom:14});base.addTo(map);$('btile').textContent=night?'☀ Carte jour':'🌙 Carte nuit'}
$('btile').onclick=()=>{night=!night;localStorage.setItem(LS+'night',night?'1':'0');tiles()};tiles();
map.on('popupopen',()=>$('leg').style.display='none');map.on('popupclose',()=>$('leg').style.display='');
const leg=$('leg');leg.innerHTML='<div class="lh">'+Object.values(AREAS).map(a=>`<i style="background:${a[1]};color:${a[1]}"></i>`).join('')+'Zones ▾</div><div class="lb">'+Object.values(AREAS).map(a=>`<div><i style="background:${a[1]};color:${a[1]}"></i>${a[0]}</div>`).join('')+'<div class="ex">🚦 trafic = estimation</div></div>';
leg.classList.toggle('on',localStorage.getItem(LS+'leg')==='1');leg.onclick=()=>localStorage.setItem(LS+'leg',leg.classList.toggle('on')?'1':'0');
if(window.ResizeObserver)new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('map'));
const fmt=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const fmtS=s=>fmt(s/60);
const dur=s=>{const m=Math.round(s/60);return m>=60?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'):m+' min'};
const km=m=>(m/1000).toFixed(1).replace('.',',')+' km';
const wz=p=>`https://www.waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`;
const gm=p=>`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
const GC={};function geom(a,b){const k=a*N+b;if(GC[k])return GC[k];const s=D.G[k];if(!s)return GC[k]=[[P[a].lat,P[a].lon],[P[b].lat,P[b].lon]];
 const o=[];let i=0,la=0,lo=0;while(i<s.length){for(const w of[0,1]){let r=0,sh=0,c;do{c=s.charCodeAt(i++)-63;r|=(c&31)<<sh;sh+=5}while(c>=32);const d=r&1?~(r>>1):r>>1;if(w)lo+=d;else la+=d}o.push([la/1e5,lo/1e5])}return GC[k]=o}
const colOf=i=>P[i].num?AREAS[P[i].area][1]:'#ff2bd6';
// --- état de la tournée calculée
let R=null,cur=null,layer=L.layerGroup().addTo(map),mlayer=L.layerGroup().addTo(map),markers={},fitPending=true;
const depMin=()=>{const[h,mi]=($('idep').value||'01:30').split(':').map(Number);return h*60+mi};
function Smat(){const S=new Float64Array(N*N);for(let k=0;k<N*N;k++){const s=D.dur[(k/N)|0][k%N],m=D.dist[(k/N)|0][k%N];S[k]=off&&s>0?m/((m/s*3.6+off)/3.6):s}return S}
const CACHE=new Map();let calcT=null,lastKey='';
function query(){const nodes=STOPS.filter(i=>sel.has(i)),q={S:Smat(),dep:depMin()*60,stop:(+$('ist').value||0)*60,tr,k:TRAFFIC.INT[ti],nodes,budget:TRAFFIC.BUDGET_MS,mode:mode==='cur'?'fixed':mode};
 if(mode!=='cur'){q.seeds=[D.seed.opt,D.seed.medoc].map(s=>s.filter(i=>sel.has(i)));
  // blocs de zones (dans l'ordre statique optimal) pour explorer « banlieue d'abord / à la fin »
  const o=D.seed.opt.filter(i=>sel.has(i)&&P[i].num),md=D.seed.medoc.filter(i=>sel.has(i)&&P[i].num);
  q.groups={bx:o.filter(i=>P[i].area==='bx'),est:md.filter(i=>P[i].area==='md'),cst:md.filter(i=>P[i].area==='ct')};
  q.groupOrders=[[{z:'bx'},{z:'est'},{z:'cst'}],[{z:'bx'},{z:'cst',rev:1},{z:'est',rev:1}],[{z:'est'},{z:'cst'},{z:'bx'}],[{z:'cst',rev:1},{z:'est',rev:1},{z:'bx'}],[{z:'bx',rev:1},{z:'est'},{z:'cst'}]]}
 if(mode==='medoc'){const md=nodes.filter(i=>P[i].area==='md'),co=nodes.filter(i=>COAST_NUMS.includes(P[i].num));q.tip=md.length?md.reduce((a,b)=>P[b].lat>P[a].lat?b:a):-1;q.coast=co;q.first=co.includes(idxOf[MONT_NUM])?idxOf[MONT_NUM]:(co.length?co.reduce((a,b)=>P[b].lat>P[a].lat?b:a):-1);q.seeds=[D.seed.medoc.filter(i=>sel.has(i))]}
 return q}
function keyOf(q){return[q.mode,q.nodes.join('.'),q.dep,q.stop,q.tr?1:0,q.k,off].join('|')}
function recalc(now){clearTimeout(calcT);calcT=setTimeout(async()=>{const q=query(),k=keyOf(q);lastKey=k;let r=CACHE.get(k);
  if(!r){$('calc').classList.add('on');r=await runSolver(q);CACHE.set(k,r);if(CACHE.size>40)CACHE.delete(CACHE.keys().next().value)}
  if(k!==lastKey)return;$('calc').classList.remove('on');R=r;window.__lastSolve={ms:r.ms,it:r.it,n:q.nodes.length,mode:q.mode};
  // excédent trafic : même ordre sans trafic
  let base=0;for(let i=1;i<r.seq.length;i++)base+=q.S[r.seq[i-1]*N+r.seq[i]];R.drive=r.lt.reduce((a,b)=>a+b,0);R.extra=R.drive-base;
  R.m=0;for(let i=1;i<r.seq.length;i++)R.m+=D.dist[r.seq[i-1]][r.seq[i]];
  if(cur!==null&&(cur<1||cur>=R.seq.length))cur=null;stats();render();if(fitPending){fitPending=false;fitAll()}},now?0:150)}
function fitAll(){const pts=R.seq.map(i=>[P[i].lat,P[i].lon]);map.fitBounds(L.latLngBounds(pts),{padding:[24,24]})}
function stats(){const n=R.seq.length-2;$('sn').textContent=n;$('sk').textContent=(R.m/1000).toFixed(1);$('sd').textContent=dur(R.drive);$('se').textContent=fmtS(R.tm[R.tm.length-1]);
 const x=Math.round(R.extra/60);$('stf').style.display=tr&&x>0?'':'none';$('sx').textContent='+'+x;
 document.querySelectorAll('#spd button').forEach(b=>b.classList.toggle('on',+b.dataset.o==off));document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.m==mode));
 $('bpick2').innerHTML=`📋<sup>${n}</sup>`}
function label(k){return String(k).padStart(2,'0')}
const LAST=()=>R.seq.length-1;
function legOf(k){const a=R.seq[k-1],b=R.seq[k],i=a*N+b,s=D.dur[a][b];return{a,b,m:D.dist[a][b],t:R.lt[k-1],x:R.lt[k-1]-Smat1(a,b),r:D.R[i]||[]}}
function Smat1(a,b){const s=D.dur[a][b],m=D.dist[a][b];return off&&s>0?m/((m/s*3.6+off)/3.6):s}
function legInfo(k){const l=legOf(k),xm=Math.round(l.x/60);return `<div><b style="color:#00f0ff">Arrivée ${fmtS(R.tm[k])}</b> · trajet ${dur(l.t)}${tr&&xm>0?` <span class="tf">🚦+${xm} min</span>`:''}</div><div class="rd">${l.r.join(' → ')}</div><div class="ex">Moy. ${l.t>0?Math.round(l.m/l.t*3.6):0} km/h · ${km(l.m)}${tr&&xm>0?' · trafic estimé':''}</div>`}
function popup(k){const p=P[R.seq[k]];
 if(!p.num)return `<div class="pp"><h3>${p.name}</h3><div class="mu">${p.addr}</div>${k==0?'<div>Départ '+fmtS(R.tm[0])+'</div>':legInfo(k)}<div class="row"><a class="wz" href="${wz(p)}">Waze</a></div></div>`;
 return `<div class="pp"><h3>${label(k)} · Pharmacie ${p.name}</h3><div class="mu">${p.town} · ${AREAS[p.area][0]}</div>${p.approx?'<div class="ap">(position approximative)</div>':''}
 <div class="ins">${p.ins}</div>${legInfo(k)}
 <div class="row"><a class="wz" href="${wz(p)}">Waze — Y aller</a><button class="bt" onclick="tog('${p.num}')">${done[p.num]?'Annuler':'Fait ✓'}</button></div><a class="gm" href="${gm(p)}">Google Maps</a></div>`}
function nextK(){for(let k=1;k<LAST();k++)if(!done[P[R.seq[k]].num])return k;return LAST()}
function render(){layer.clearLayers();
 for(let k=1;k<R.seq.length;k++){const a=R.seq[k-1],b=R.seq[k],c=colOf(b),g=geom(a,b),tf=tr&&R.lt[k-1]-Smat1(a,b)>30;
  L.polyline(g,{color:c,weight:13,opacity:.2,interactive:false}).addTo(layer);L.polyline(g,{color:c,weight:4.5,opacity:1,interactive:false,dashArray:D.G[a*N+b]?null:'6 8'}).addTo(layer);
  if(tf)L.polyline(g,{color:'#ff3b5c',weight:2,opacity:.9,dashArray:'2 7',interactive:false}).addTo(layer)}
 drawMarkers();
 $('list').innerHTML=`<button class="bt pk" onclick="pick()">📋 Pharmacies du soir (${R.seq.length-2}/${STOPS.length})</button>`+R.seq.map((pi,k)=>{const p=P[pi],c=colOf(pi);return `<div class="it${p.num&&done[p.num]?' done':''}" onclick="go(${k})"><div class="n" style="background:${c};--c:${c};color:#07060f">${p.num?(done[p.num]?'✓':label(k)):(k?'🏠':'D')}</div><div class="t"><b>${p.num?'Pharmacie '+p.name:p.name}</b><br><small>${p.town||p.addr}</small></div><div class="h">${fmtS(R.tm[k])}</div></div>`}).join('');
 if(cur===null||cur<1||cur>LAST()||(P[R.seq[cur]].num&&done[P[R.seq[cur]].num]))cur=nextK();card()}
function drawMarkers(){mlayer.clearLayers();markers={};if(!R)return;const z=map.getZoom(),sz=z<=9?24:z<=11?28:32,fs=z<=9?12:z<=11?14:15,rad=z<12?sz*0.95:0;
 const cl=[];R.seq.forEach((pi,k)=>{const p=P[pi],pt=map.latLngToLayerPoint([p.lat,p.lon]);if(!p.num){cl.push({pt,m:[k],fixed:1});return}
  const c=rad&&cl.find(c=>!c.fixed&&c.pt.distanceTo(pt)<rad);if(c)c.m.push(k);else cl.push({pt,m:[k]})});
 for(const c of cl){if(c.m.length===1){const k=c.m[0],pi=R.seq[k],p=P[pi],col=colOf(pi),cu=k===cur;
   const html=!p.num?`<div class="mk sq" style="--c:#ff2bd6;width:${sz}px;height:${sz}px;font-size:${fs}px">${k==0?'D':'🏠'}</div>`:done[p.num]?`<div class="mk done" style="width:${sz}px;height:${sz}px;font-size:${fs+2}px">✓</div>`:`<div class="mk${cu?' cu':''}" style="background:${col};--c:${col};color:#07060f;width:${sz}px;height:${sz}px;font-size:${fs}px">${label(k)}</div>`;
   markers[k]=L.marker([p.lat,p.lon],{icon:L.divIcon({html,className:'',iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]}),zIndexOffset:p.num?(cu?2000:0):1000}).bindPopup(()=>popup(k),{maxWidth:300,autoPanPaddingTopLeft:L.point(10,10),autoPanPaddingBottomRight:L.point(10,10)}).addTo(mlayer)}
  else{const ks=c.m.slice().sort((a,b)=>a-b),rg=[];for(const k of ks){const l=rg[rg.length-1];if(l&&k===l[1]+1)l[1]=k;else rg.push([k,k])}
   const txt=rg.length<=2?rg.map(([a,b])=>a===b?label(a):label(a)+'–'+label(b)).join(' · '):ks.length+' arrêts';const ll=L.latLngBounds(ks.map(k=>[P[R.seq[k]].lat,P[R.seq[k]].lon]));
   const col=colOf(R.seq[ks[0]]),hasCur=ks.includes(cur);
   L.marker(ll.getCenter(),{icon:L.divIcon({html:`<div class="mkc${hasCur?' cu':''}" style="--c:${col};font-size:${fs}px;height:${sz}px">${txt}</div>`,className:'',iconSize:null,iconAnchor:[0,sz/2]}),zIndexOffset:500})
    .on('click',()=>map.fitBounds(ll,{padding:[50,50],maxZoom:15})).addTo(mlayer)}}}
map.on('zoomend',drawMarkers);
function card(){const k=cur,p=P[R.seq[k]],nd=R.seq.filter(i=>P[i].num&&done[P[i].num]).length,l=legOf(k),c=colOf(R.seq[k]),xm=Math.round(l.x/60);
 $('card').classList.toggle('open',open);
 $('card').innerHTML=`<div class="grip" onclick="tgc()" aria-label="Détails"><span></span>${open?'▾':'▴'}</div><div class="row"><div class="n" onclick="go(${k})" style="background:${c};--c:${c};color:#07060f">${p.num?label(k):'🏠'}</div><div class="nm" onclick="tgc()"><div class="pn">${p.num?p.name:'Arrivée maison'}</div><div class="sub"><b>${fmtS(R.tm[k])}</b> · ${dur(l.t)}${tr&&xm>0?` <span class="tf">🚦+${xm}</span>`:''}${open?'':' · '+(p.town||p.addr)}</div></div><a class="wz" href="${wz(p)}">➤ WAZE</a>${open?'':(p.num?`<button class="bt ok" onclick="tog('${p.num}',1)" aria-label="Fait">✓</button>`:'')+`<button class="bt" onclick="nx()" aria-label="Suivant">›</button>`}</div>
 <div class="more"><div class="kick">Prochain arrêt · ${nd}/${R.seq.length-2} faits · <em>${p.town||p.addr}</em></div>${p.num?`<div class="ins">${p.ins}</div>`:''}<div class="rd">${l.r.join(' → ')}</div>
 <div class="row">${p.num?`<button class="bt ok" onclick="tog('${p.num}',1)">✓ Fait</button>`:''}<button class="bt" onclick="nx()">Suivant ›</button></div></div>`}
function tgc(v){open=v===undefined?!open:v;localStorage.setItem(LS+'card',open?'1':'0');card()}
{let y0=null;const el=$('card');el.addEventListener('touchstart',e=>{y0=e.touches[0].clientY},{passive:true});el.addEventListener('touchend',e=>{if(y0===null)return;const dy=e.changedTouches[0].clientY-y0;y0=null;if(dy<-35&&!open)tgc(true);else if(dy>35&&open)tgc(false)},{passive:true})}
function go(k){$('list').classList.remove('on');cur=k;card();const p=P[R.seq[k]];map.setView([p.lat,p.lon],16,{animate:false});drawMarkers();setTimeout(()=>markers[k]&&markers[k].openPopup(),250)}
function tog(n,adv){done[n]=!done[n];localStorage.setItem(LS+'done',JSON.stringify(done));map.closePopup();if(adv||done[n])cur=nextK();render()}
function nx(){let k=cur;do{k=k%LAST()+1}while(k<LAST()&&done[P[R.seq[k]].num]&&k!=cur);cur=k;card();drawMarkers();const p=P[R.seq[k]];map.panTo([p.lat,p.lon])}
const caps=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function loadView(){const s=R.seq.map((pi,k)=>[pi,k]).filter(([pi])=>P[pi].num).reverse();$('lmode').textContent=MODES[mode]+' · '+(R.seq.length-2)+' pharmacies';
 $('lbody').innerHTML=s.map(([pi,k])=>{const p=P[pi];return `<div class="r"><div><b class="big">${caps(p.name)}</b><br><small>${p.town}</small> <span class="lv">livrée en ${k}<sup>e</sup> · ${fmtS(R.tm[k])}</span></div></div>`}).join('');document.body.classList.add('ld')}
// --- écran « Pharmacies du soir »
let draft=null;
function pick(){$('list').classList.remove('on');draft=new Set(sel);$('pq').value='';const y=SEL[day(1)];
 $('pyest').style.display=y&&!SEL[day()]?'':'none';if(y)$('pyest').textContent=`↺ Reprendre la sélection d'hier (${y.length})`;$('pday').textContent='Soirée du '+day().split('-').reverse().join('/');drawPick();document.body.classList.add('pk')}
function drawPick(){const q=caps($('pq').value.trim());let h='';
 for(const[a,[nm,col]]of Object.entries(AREAS)){const it=STOPS.filter(i=>P[i].area===a),vis=it.filter(i=>!q||caps(P[i].name+' '+P[i].town+' '+P[i].num).includes(q));if(!vis.length)continue;const nOn=it.filter(i=>draft.has(i)).length;
  h+=`<div class="pg"><div class="pgh" style="--c:${col}"><i></i>${nm}<span>${nOn}/${it.length}</span><button onclick="pgAll('${a}',1)">tout</button><button onclick="pgAll('${a}',0)">aucun</button></div>`+vis.map(i=>{const p=P[i];return `<label class="pi${draft.has(i)?' on':''}"><input type="checkbox" ${draft.has(i)?'checked':''} onchange="pTog(${i},this.checked)"><b>${p.num}</b><span><b>${p.name}</b><small>${p.town}</small></span></label>`}).join('')+'</div>'}
 $('plist').innerHTML=h||'<div class="pe">Aucune pharmacie trouvée</div>';$('pgo').textContent=`Calculer le meilleur tour (${draft.size})`;$('pgo').disabled=!draft.size}
window.pTog=(i,v)=>{v?draft.add(i):draft.delete(i);drawPick()};window.pgAll=(a,v)=>{STOPS.filter(i=>P[i].area===a).forEach(i=>v?draft.add(i):draft.delete(i));drawPick()};
$('pq').oninput=drawPick;$('pall').onclick=()=>{STOPS.forEach(i=>draft.add(i));drawPick()};$('pnone').onclick=()=>{draft.clear();drawPick()};
$('pyest').onclick=()=>{draft=new Set((SEL[day(1)]||[]).filter(n=>idxOf[n]!==undefined).map(n=>idxOf[n]));drawPick()};
$('pclose').onclick=()=>document.body.classList.remove('pk');
$('pgo').onclick=()=>{if(!draft.size)return;sel=new Set(draft);saveSel(STOPS.filter(i=>sel.has(i)).map(i=>P[i].num));if(mode==='cur'){mode='best';localStorage.setItem(LS+'mode5',mode)}document.body.classList.remove('pk');cur=null;fitPending=true;map.closePopup();recalc(true)};
// --- réglages & contrôles
['idep','ist'].forEach(k=>{const v=localStorage.getItem(LS+k);if(v!==null)$(k).value=v;$(k).addEventListener('input',()=>{localStorage.setItem(LS+k,$(k).value);recalc()})});
$('itr').checked=tr;$('itr').onchange=()=>{tr=$('itr').checked;localStorage.setItem(LS+'traffic',tr?'1':'0');recalc(true)};
$('iint').value=ti;$('lint').textContent=TRAFFIC.INT_LBL[ti];$('iint').oninput=()=>{ti=+$('iint').value;$('lint').textContent=TRAFFIC.INT_LBL[ti];localStorage.setItem(LS+'tint',ti);recalc()};
$('bload').onclick=loadView;$('bpick').onclick=pick;$('bpick2').onclick=pick;
$('bl').onclick=()=>$('list').classList.toggle('on');$('bs').onclick=()=>$('set').classList.toggle('on');
$('reset').onclick=()=>{if(confirm('Effacer les arrêts faits ?')){done={};localStorage.setItem(LS+'done','{}');cur=null;render()}};
document.querySelectorAll('#spd button').forEach(b=>b.onclick=()=>{off=+b.dataset.o;localStorage.setItem(LS+'off',off);recalc(true)});
document.querySelectorAll('#seg button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;localStorage.setItem(LS+'mode5',mode);cur=null;recalc(true)});
window.__seed=k=>D.seed[k].filter(i=>P[i].num&&sel.has(i));window.__dist=(a,b)=>D.dist[a][b];window.__q=m=>{const sv=mode;mode=m;const q=query();mode=sv;return q};Object.assign(window,{go,tog,nx,tgc,loadView,pick,map,__tfp:{get R(){return R},P,Z,TRAFFIC,get sel(){return sel}}});
map.fitBounds(L.latLngBounds(P.map(p=>[p.lat,p.lon])),{padding:[24,24]});recalc(true);
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
document.documentElement.dataset.v='m5';
function toast(t){let el=$$('upd');if(!el){el=document.createElement('div');el.id='upd';el.style.cssText="position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:6000;padding:8px 18px;border-radius:999px;background:rgba(11,9,24,.92);border:1px solid rgba(255,43,214,.6);color:#ffd6f6;font:700 14px 'Source Sans 3',sans-serif;box-shadow:0 0 18px rgba(255,43,214,.55),0 0 6px rgba(0,240,255,.4) inset;white-space:nowrap";document.body.appendChild(el)}el.textContent=t;clearTimeout(el._t);el._t=setTimeout(()=>el.remove(),8000)}
if('serviceWorker' in navigator){const sw=navigator.serviceWorker,hadCtl=!!sw.controller;let reloading=false;
 sw.addEventListener('controllerchange',()=>{if(!hadCtl||reloading||sessionStorage.getItem('tfp_rl')==='1')return;reloading=true;sessionStorage.setItem('tfp_rl','1');toast('Mise à jour…');setTimeout(()=>location.reload(),300)});
 setTimeout(()=>sessionStorage.removeItem('tfp_rl'),10000);
 sw.register('sw.js',{updateViaCache:'none'}).then(reg=>{const up=()=>reg.update().catch(()=>{});
  reg.addEventListener('updatefound',()=>{if(hadCtl)toast('Mise à jour…')});
  up();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')up()})}).catch(()=>{})}
