let stationsData=[];
let stationsFavoris=[];
let stationsVisible=5;
let stationsFilter='SP95';
let stationsSort='distance';
let stationsLoaded=false;
let stationsMap=null;
let stationsMarkers={};
let userLat=null,userLng=null;
let renameTargetId=null;
let mapResizeInited=false;

async function loadFavoris(){
  try {
    const dbFavs=await getFavoris();
    // Préserver les prix déjà en mémoire ou dans stationsData
    stationsFavoris=dbFavs.map(dbF=>{
      const live=stationsData.find(d=>d.id===dbF.id);
      const mem=stationsFavoris.find(f=>f.id===dbF.id);
      return {...dbF,prix:(live&&live.prix)||( mem&&mem.prix)||{}};
    });
  } catch(e) { stationsFavoris=[]; }
}

async function initStations(){
  await loadFavoris();
  if(!mapResizeInited){ initMapResize(); mapResizeInited=true; }
  if(stationsLoaded){ updateStationDropdown(); return; }
  geolocateStations();
}

function geolocateStations(){
  document.getElementById('stations-loading').style.display='block';
  document.getElementById('stations-content').style.display='none';
  document.getElementById('stations-error').style.display='none';
  if(!navigator.geolocation){showStationsError('Géolocalisation non disponible. Entre une ville.');return;}
  navigator.geolocation.getCurrentPosition(
    pos=>loadStations(pos.coords.latitude,pos.coords.longitude),
    ()=>showStationsError('Géolocalisation refusée. Entre une ville dans la barre de recherche.'),
    {timeout:10000,maximumAge:60000}
  );
}

async function searchStationsByCity(){
  const city=document.getElementById('stations-search').value.trim();
  if(!city)return;
  document.getElementById('stations-loading').style.display='block';
  document.getElementById('stations-content').style.display='none';
  document.getElementById('stations-error').style.display='none';
  try{
    const geo=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=fr`);
    const geoData=await geo.json();
    if(!geoData.length){showStationsError('Ville introuvable. Essaie avec le code postal.');return;}
    await loadStations(parseFloat(geoData[0].lat),parseFloat(geoData[0].lon));
  }catch(e){showStationsError('Erreur de recherche. Vérifie ta connexion.');}
}

async function loadStations(lat,lng){
  userLat=lat; userLng=lng;
  try{
    const res=await getStations(lat,lng);
    if(res.error){showStationsError('Erreur API : '+res.error);return;}
    stationsData=res.stations||[];
    stationsLoaded=true;
    stationsVisible=5;
    document.getElementById('stations-loading').style.display='none';
    document.getElementById('stations-content').style.display='block';
    renderStationsList();
    renderStationsMap(lat,lng);
    updateStationDropdown();
  }catch(e){
    console.error(e);
    showStationsError('Impossible de charger les stations. Vérifie ta connexion.');
  }
}

function showStationsError(msg){
  document.getElementById('stations-loading').style.display='none';
  document.getElementById('stations-content').style.display='none';
  const err=document.getElementById('stations-error');
  err.style.display='block'; err.textContent=msg;
}

function setStationsFilter(f,btn){
  stationsFilter=f;
  document.querySelectorAll('.s-pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  if(stationsLoaded)renderStationsList();
}

function setSort(mode,btn){
  stationsSort=mode;
  document.querySelectorAll('.s-sort-pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  if(stationsLoaded)renderStationsList();
}

function renderStationsList(){
  const list=document.getElementById('stations-list');
  const btnMore=document.getElementById('btn-voir-plus-s');
  const sorted=stationsSort==='price'
    ? [...stationsData].sort((a,b)=>(a.prix[stationsFilter]||999)-(b.prix[stationsFilter]||999))
    : [...stationsData].sort((a,b)=>a.dist-b.dist);
  const visible=sorted.slice(0,stationsVisible);
  list.innerHTML=visible.map((s,i)=>{
    const prix=s.prix[stationsFilter];
    const isFav=stationsFavoris.some(f=>f.id===s.id);
    const sJson=JSON.stringify(s).replace(/"/g,'&quot;');
    return`<div class="s-card${isFav?' s-fav':''}" id="s-card-${s.id}">
      <div class="s-top">
        <div class="s-info">
          <div class="s-name">${s.nom}${i===0&&prix?'<span class="s-badge-best">Moins cher</span>':''}</div>
          <div class="s-dist">${s.dist} km · Maj. ${s.maj}</div>
        </div>
        <div class="s-prix-main-wrap">
          <div class="s-prix-main">${prix?prix.toFixed(3):'—'}</div>
          <div class="s-prix-label">€/L ${stationsFilter}</div>
        </div>
      </div>
      <div class="s-prices">
        ${s.prix.SP95?`<span class="s-tag">SP95 ${s.prix.SP95.toFixed(3)}</span>`:''}
        ${s.prix.SP98?`<span class="s-tag s-tag-sp98">SP98 ${s.prix.SP98.toFixed(3)}</span>`:''}
        ${s.prix.Diesel?`<span class="s-tag s-tag-diesel">Diesel ${s.prix.Diesel.toFixed(3)}</span>`:''}
        ${s.prix.E85?`<span class="s-tag s-tag-e85">E85 ${s.prix.E85.toFixed(3)}</span>`:''}
      </div>
      <div class="s-actions">
        <button class="s-btn-voir" onclick="flyToStation('${s.id}')">🗺️ Voir</button>
        <button class="s-btn-waze" onclick="openWazeStation(${s.lat},${s.lng},'${s.adresse.replace(/'/g,"\\'")}')">🧭 Waze</button>
        <button class="s-btn-copy" onclick="copyStationAdresse('${s.adresse.replace(/'/g,"\\'")}')">📋 Adresse</button>
        <button class="s-btn-fav${isFav?' active':''}" onclick="toggleStationFav('${s.id}')">
          ${isFav?'★':'☆'}
        </button>
      </div>
    </div>`;
  }).join('');
  btnMore.style.display=stationsVisible<sorted.length?'block':'none';
  if(stationsVisible<sorted.length) btnMore.textContent=`Voir ${Math.min(2,sorted.length-stationsVisible)} de plus (${sorted.length-stationsVisible} restantes)`;
}

function voirPlusStations(){stationsVisible+=2;renderStationsList();}

function renderStationsMap(lat,lng){
  // FIX BUG : invalider la taille de la carte après un délai (évite le bug quand la modal s'ouvre)
  if(stationsMap){stationsMap.remove();stationsMap=null;}
  stationsMarkers={};

  stationsMap=L.map('stations-map',{zoomControl:true}).setView([lat,lng],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap', maxZoom:19
  }).addTo(stationsMap);

  // Marqueur position utilisateur
  L.circleMarker([lat,lng],{radius:9,fillColor:'#a78bfa',color:'#fff',weight:2,fillOpacity:1})
    .addTo(stationsMap)
    .bindPopup('📍 Ma position');

  // Marqueurs toutes les stations (pas seulement les visibles)
  stationsData.forEach((s,i)=>{
    if(!s.lat||!s.lng)return;
    const isFav=stationsFavoris.some(f=>f.id===s.id);
    const isBest=i===0;
    const color=isBest?'#4fc3a1':isFav?'#e8c547':'#6b6f7a';

    // Popup avec nom, prix et boutons
    const isFavPop=stationsFavoris.some(f=>f.id===s.id);
    const prixLines=Object.entries(s.prix).map(([k,v])=>`<span style="display:inline-block;margin:.1rem .15rem;padding:.1rem .35rem;border-radius:4px;font-size:11px;background:rgba(255,255,255,.1);color:#f0ede6">${k} ${v.toFixed(3)}</span>`).join('');
    const popupContent=`
      <div style="font-family:'DM Mono',monospace;min-width:180px;padding:.2rem">
        <div style="font-size:13px;font-weight:500;color:#f0ede6;margin-bottom:.3rem">${s.nom}</div>
        <div style="font-size:11px;color:#6b6f7a;margin-bottom:.4rem">${s.adresse||''}</div>
        <div style="margin-bottom:.5rem">${prixLines||'<span style="font-size:11px;color:#6b6f7a">Prix non disponible</span>'}</div>
        <div style="display:flex;gap:.4rem">
          <button onclick="openWazeStation(${s.lat},${s.lng},'${(s.adresse||'').replace(/'/g,"\\'")}');return false"
            style="flex:1;background:#1d9e75;color:#fff;border:none;border-radius:5px;font-size:11px;padding:.3rem .5rem;cursor:pointer">🧭 Waze</button>
          <button onclick="copyStationAdresse('${(s.adresse||'').replace(/'/g,"\\'")}');return false"
            style="flex:1;background:#2a2d35;color:#e8c547;border:1px solid rgba(232,197,71,.3);border-radius:5px;font-size:11px;padding:.3rem .5rem;cursor:pointer">📋 Copier</button>
          <button id="map-fav-btn-${s.id}" onclick="toggleFavFromMap('${s.id}');return false"
            style="background:${isFavPop?'rgba(232,197,71,.2)':'#2a2d35'};color:${isFavPop?'#e8c547':'#6b6f7a'};border:1px solid ${isFavPop?'rgba(232,197,71,.3)':'#2a2d35'};border-radius:5px;font-size:13px;padding:.3rem .5rem;cursor:pointer">${isFavPop?'★':'☆'}</button>
        </div>
      </div>`;

    const marker=L.circleMarker([s.lat,s.lng],{
      radius:isBest?10:8,
      fillColor:color,color:'#fff',weight:2,fillOpacity:1
    }).addTo(stationsMap);

    marker.bindPopup(popupContent,{
      maxWidth:220,
      className:'s-map-popup'
    });
    stationsMarkers[s.id]=marker;

    // Scroll vers la carte correspondante en cliquant
    marker.on('popupopen',()=>{
      const card=document.getElementById('s-card-'+s.id);
      if(card)card.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  });

  // Invalider la taille après rendu (fix bug carte tronquée)
  setTimeout(()=>{if(stationsMap)stationsMap.invalidateSize();},300);
}

// ---- WAZE CORRIGÉ — avec coordonnées GPS ----
function openWazeStation(lat,lng,adresse){
  if(!lat||!lng){toast('Coordonnées GPS manquantes.',true);return;}
  const isMobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
  // Sur mobile : waze:// avec lat/lng — sur desktop : lien web avec lat/lng
  const url=isMobile
    ? `waze://ul?ll=${lat},${lng}&navigate=yes&zoom=17`
    : `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  window.open(url,'_blank');
  toast('Ouverture Waze…');
}

function copyStationAdresse(adresse){
  if(!adresse||adresse==='undefined'){toast('Adresse non disponible.',true);return;}
  if(navigator.clipboard){
    navigator.clipboard.writeText(adresse).then(()=>toast('Adresse copiée !'));
  }else{
    const el=document.createElement('textarea');
    el.value=adresse;document.body.appendChild(el);el.select();
    document.execCommand('copy');document.body.removeChild(el);
    toast('Adresse copiée !');
  }
}

async function toggleStationFav(stationId){
  const station=stationsData.find(s=>s.id===stationId)||stationsFavoris.find(s=>s.id===stationId);
  if(!station)return;
  const idx=stationsFavoris.findIndex(f=>f.id===stationId);
  if(idx>=0){
    await deleteFavori(stationId);
    stationsFavoris.splice(idx,1);
    toast('Retiré des favoris');
  }else{
    await addFavori(station);
    stationsFavoris.push(station);
    toast('Ajouté aux favoris ⭐');
  }
  renderStationsList();
  renderFavorisTab();
  updateStationDropdown();
  // Rafraîchir la carte pour mettre à jour les couleurs
  if(stationsMap&&userLat&&userLng) renderStationsMap(userLat,userLng);
}

function renderFavorisTab(){
  const list=document.getElementById('favoris-stations-list');
  const empty=document.getElementById('favoris-stations-empty');
  if(!stationsFavoris.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=stationsFavoris.map(s=>{
    // Fusionner avec les prix live si la station est dans stationsData
    const live=stationsData.find(d=>d.id===s.id);
    if(live&&live.prix)s.prix=live.prix;
    const prix=s.prix?s.prix[stationsFilter]:null;
    return`<div class="s-card s-fav">
      <div class="s-top">
        <div class="s-info">
          <div class="s-name">${s.nom}</div>
          <div class="s-dist">${s.adresse||''}</div>
        </div>
        <div class="s-prix-main-wrap">
          <div class="s-prix-main">${prix?prix.toFixed(3):'—'}</div>
          <div class="s-prix-label">€/L ${stationsFilter}</div>
        </div>
      </div>
      ${s.prix?`<div class="s-prices">
        ${s.prix.SP95?`<span class="s-tag">SP95 ${s.prix.SP95.toFixed(3)}</span>`:''}
        ${s.prix.SP98?`<span class="s-tag s-tag-sp98">SP98 ${s.prix.SP98.toFixed(3)}</span>`:''}
        ${s.prix.Diesel?`<span class="s-tag s-tag-diesel">Diesel ${s.prix.Diesel.toFixed(3)}</span>`:''}
        ${s.prix.E85?`<span class="s-tag s-tag-e85">E85 ${s.prix.E85.toFixed(3)}</span>`:''}
      </div>`:''}
      <div class="s-actions">
        <button class="s-btn-waze" onclick="openWazeStation(${s.lat},${s.lng},'${(s.adresse||'').replace(/'/g,"\\'")}')">🧭 Waze</button>
        <button class="s-btn-copy" onclick="copyStationAdresse('${(s.adresse||'').replace(/'/g,"\\'")}')">📋 Adresse</button>
        <button class="s-btn-edit-nom" onclick="openRenameModal('${s.id}')">✏️</button>
        <button class="s-btn-fav active" onclick="toggleStationFav('${s.id}')">★</button>
      </div>
    </div>`;
  }).join('');
}

// Met à jour le menu déroulant station dans le formulaire
function updateStationDropdown(){
  const sel=document.getElementById('f-station-select');
  if(!sel)return;
  sel.innerHTML=`<option value="">-- Sélectionner une station --</option>`;
  if(stationsFavoris.length){
    const grp=document.createElement('optgroup');
    grp.label='⭐ Mes favoris';
    stationsFavoris.forEach(s=>{
      const opt=document.createElement('option');
      opt.value=s.id;
      opt.textContent=`${s.nom}${s.dist?' — '+s.dist+' km':''}`;
      opt.dataset.nom=s.nom;
      const p=s.prix&&s.prix[stationsFilter]?s.prix[stationsFilter]:'';
      opt.dataset.prix=p;
      opt.dataset.maj=s.maj||'';
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  if(stationsData.length){
    const grp=document.createElement('optgroup');
    grp.label='📍 Stations proches';
    stationsData.slice(0,8).forEach(s=>{
      const opt=document.createElement('option');
      opt.value=s.id;
      opt.textContent=`${s.nom} — ${s.dist} km`;
      opt.dataset.nom=s.nom;
      const p=s.prix&&s.prix[stationsFilter]?s.prix[stationsFilter]:'';
      opt.dataset.prix=p;
      opt.dataset.maj=s.maj||'';
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }
  const grpAutre=document.createElement('optgroup');
  grpAutre.label='✏️ Autre';
  const optAutre=document.createElement('option');
  optAutre.value='autre';
  optAutre.textContent='Saisir manuellement…';
  grpAutre.appendChild(optAutre);
  sel.appendChild(grpAutre);
}

// Centrer la carte sur une station et ouvrir son popup
function flyToStation(stationId){
  const s=stationsData.find(s=>s.id===stationId);
  if(!s||!stationsMap)return;
  const mapEl=document.getElementById('stations-map');
  mapEl.scrollIntoView({behavior:'smooth',block:'nearest'});
  setTimeout(()=>{
    stationsMap.flyTo([s.lat,s.lng],16,{duration:.8});
    const marker=stationsMarkers[stationId];
    if(marker)setTimeout(()=>marker.openPopup(),900);
  },300);
}

// Redimensionnement de la carte par drag
function initMapResize(){
  const handle=document.getElementById('map-resize-handle');
  const mapEl=document.getElementById('stations-map');
  if(!handle||!mapEl)return;
  let startY,startH;
  function onMove(e){
    e.preventDefault();
    const y=e.touches?e.touches[0].clientY:e.clientY;
    const newH=Math.max(150,Math.min(650,startH+(y-startY)));
    mapEl.style.height=newH+'px';
    if(stationsMap)stationsMap.invalidateSize();
  }
  function onEnd(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onEnd);
    document.removeEventListener('touchmove',onMove);
    document.removeEventListener('touchend',onEnd);
    handle.classList.remove('dragging');
  }
  function onStart(e){
    startY=e.touches?e.touches[0].clientY:e.clientY;
    startH=mapEl.offsetHeight;
    handle.classList.add('dragging');
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onEnd);
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
  }
  handle.addEventListener('mousedown',onStart);
  handle.addEventListener('touchstart',onStart,{passive:true});
}

// Toggle favori depuis le popup carte (sans re-render la carte)
async function toggleFavFromMap(stationId){
  const station=stationsData.find(s=>s.id===stationId)||stationsFavoris.find(s=>s.id===stationId);
  if(!station)return;
  const idx=stationsFavoris.findIndex(f=>f.id===stationId);
  if(idx>=0){
    await deleteFavori(stationId);
    stationsFavoris.splice(idx,1);
    toast('Retiré des favoris');
  }else{
    await addFavori(station);
    stationsFavoris.push(station);
    toast('Ajouté aux favoris ⭐');
  }
  const btn=document.getElementById('map-fav-btn-'+stationId);
  if(btn){
    const isFav=stationsFavoris.some(f=>f.id===stationId);
    btn.textContent=isFav?'★':'☆';
    btn.style.background=isFav?'rgba(232,197,71,.2)':'#2a2d35';
    btn.style.color=isFav?'#e8c547':'#6b6f7a';
    btn.style.borderColor=isFav?'rgba(232,197,71,.3)':'#2a2d35';
  }
  renderStationsList();
  renderFavorisTab();
  updateStationDropdown();
}

// Ajouter un favori par ID manuel
async function addFavoriById(){
  const input=document.getElementById('fav-id-input');
  const id=input.value.trim();
  if(!id){toast('Entre un ID de station.',true);return;}
  if(stationsFavoris.some(f=>f.id===id)){toast('Déjà dans les favoris.');return;}
  toast('Recherche…');
  try{
    const res=await getStationById(id);
    if(!res.station){toast('Station introuvable.',true);return;}
    await addFavori(res.station);
    stationsFavoris.push(res.station);
    input.value='';
    toast('Station ajoutée aux favoris ⭐');
    renderFavorisTab();
    updateStationDropdown();
  }catch(e){toast('Erreur lors de la recherche.',true);}
}

// Renommer un favori
function openRenameModal(stationId){
  renameTargetId=stationId;
  const fav=stationsFavoris.find(f=>f.id===stationId);
  document.getElementById('rename-input').value=fav?fav.nom:'';
  document.getElementById('modal-rename').classList.add('open');
}
function closeRenameModal(e){
  if(e&&e.target!==document.getElementById('modal-rename'))return;
  document.getElementById('modal-rename').classList.remove('open');
  renameTargetId=null;
}
async function validerRename(){
  const newNom=document.getElementById('rename-input').value.trim();
  if(!newNom)return;
  const fav=stationsFavoris.find(f=>f.id===renameTargetId);
  if(!fav||newNom===fav.nom){document.getElementById('modal-rename').classList.remove('open');return;}
  if(!confirm(`Voulez-vous vraiment changer le nom en :\n"${newNom}" ?`))return;
  await renameFavori(renameTargetId,newNom);
  fav.nom=newNom;
  document.getElementById('modal-rename').classList.remove('open');
  renameTargetId=null;
  toast('Nom mis à jour ✓');
  renderFavorisTab();
  updateStationDropdown();
}

function switchStationsTab(id,btn){
  document.querySelectorAll('.tab-btn-s').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('s-tab-proches').style.display=id==='proches'?'block':'none';
  document.getElementById('s-tab-favoris').style.display=id==='favoris'?'block':'none';
  if(id==='favoris') refreshAndRenderFavoris();
  if(id==='proches'&&stationsMap)setTimeout(()=>stationsMap.invalidateSize(),100);
}

async function refreshAndRenderFavoris(){
  renderFavorisTab(); // affiche avec prix en cache d'abord
  try{
    const updated=await refreshFavorisPrix();
    stationsFavoris=updated;
    renderFavorisTab();
  }catch(e){}
}
