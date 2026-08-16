let data=[];
let openId=null,editId=null;

// ---- UTILITAIRES ----
function fd(d){const[y,m,j]=d.split('-');return`${j}/${m}/${y}`}
function labelType(t){return t==='SP95'?'SP95/E10':t;}
function kmParcourus(p){return(p.kmTotal!=null&&p.kmDepart!=null)?p.kmTotal-p.kmDepart:null}
function precision(p){
  if(p.kmTotal==null||p.estimRestante==null||!p.estimPlein||!p.kmDepart)return null;
  const k=kmParcourus(p);if(!k||k<=0)return null;
  return(k+p.estimRestante)/p.estimPlein;
}
function precisionColor(v){if(!v)return'var(--muted)';const p=Math.round(v*100);return p>=95?'var(--accent2)':p>=85?'var(--accent)':'var(--accent3)'}
function precClass(p){return p>=95?'prec-green':p>=85?'prec-yellow':'prec-orange'}
function conso(p){if(!p.litres||p.litres<=0)return null;const km=kmParcourus(p);if(!km||km<=0)return null;return(p.litres/km)*100;}
function coutKm(p){const km=kmParcourus(p);if(!km||km<=0||!p.total)return null;return(p.total/km)*100;}
function litresPlein(p){if(p.litres>0)return p.litres;if(p.total>0&&p.prixL>0)return p.total/p.prixL;return null;}
function consoMoyenne(){const vals=data.filter(p=>p.kmTotal!==null).map(p=>conso(p)).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function autonomie(p){const l=litresPlein(p);const cm=consoMoyenne();if(!l||!cm)return null;return l/cm*100;}
function joursMoyen(arr){if(arr.length<2)return null;const sorted=[...arr].sort((a,b)=>new Date(a.date)-new Date(b.date));let total=0,n=0;for(let i=1;i<sorted.length;i++){const d=(new Date(sorted[i].date)-new Date(sorted[i-1].date))/86400000;if(d>0){total+=d;n++;}}return n>0?Math.round(total/n):null;}
function coutAnnuelProjecte(arr){if(arr.length<2)return null;const sorted=[...arr].sort((a,b)=>new Date(a.date)-new Date(b.date));const nbJours=(new Date(sorted[sorted.length-1].date)-new Date(sorted[0].date))/86400000;if(nbJours<14)return null;const dep=arr.reduce((s,p)=>s+p.total,0);return Math.round(dep/nbJours*365);}

function toast(msg,err=false){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.background=err?'var(--danger)':'var(--accent)';t.style.color=err?'#fff':'#0e0f11';
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);
}

// ---- NAVIGATION ----
function showTab(id,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='stats')renderStats();
  if(id==='estimation')initEstimation();
  if(id==='precision')renderPrecision(data);
  if(id==='stations')initStations();
  if(id==='entretien')initEntretien();
  if(id==='parametres')initParametres();
}

// ---- DONNÉES ----
async function loadData(){
  data=await getPleins(currentVehicleId);
  refreshAll();
}

function refreshAll(){
  renderHistorique();
  updateMiniStats();
  updateBadge();
  refreshKmNotice();
}

// ---- HISTORIQUE (page d'accueil) ----
function renderHistorique(){
  // Banner Phase 1
  const openPleins=data.filter(p=>p.kmTotal===null);
  const banner=document.getElementById('phase1-banner');
  if(openPleins.length){
    const p=openPleins[openPleins.length-1];
    banner.style.display='block';
    document.getElementById('phase1-date').textContent=fd(p.date);
    document.getElementById('phase1-type').className='tag tag-'+p.type;
    document.getElementById('phase1-type').textContent=labelType(p.type);
    document.getElementById('phase1-km').textContent=p.kmDepart?p.kmDepart.toLocaleString('fr-FR')+' km':'—';
    document.getElementById('phase1-odb').textContent=p.estimPlein?p.estimPlein+' km':'—';
    document.getElementById('phase1-total').textContent=p.total?p.total.toFixed(2)+' €':'—';
    document.getElementById('phase1-station').textContent=p.station||'—';
    document.getElementById('btn-phase1-p2').onclick=()=>ouvrirPhase2(p.id);
    document.getElementById('btn-phase1-edit').onclick=()=>ouvrirEdit(p.id);
  }else{
    banner.style.display='none';
  }

  // Lignes historique (pleins complets uniquement, du plus récent)
  const complets=[...data.filter(p=>p.kmTotal!==null)].reverse();
  const rows=document.getElementById('histo-rows');
  if(!complets.length){rows.innerHTML='<div class="no-data" style="padding:2rem;text-align:center;color:var(--muted);font-size:.78rem">⛽ Aucun plein complet pour l\'instant.</div>';return;}
  rows.innerHTML=complets.map((p,i)=>{
    const km=kmParcourus(p);
    const pr=precision(p);
    const pct=pr?Math.round(pr*100):null;
    return`<div class="histo-row">
      <div class="histo-main">
        <div class="histo-left">
          <div class="histo-date">${fd(p.date)}</div>
          <span class="tag tag-${p.type}">${labelType(p.type)}</span>
          <div class="histo-resume">
            <span class="histo-km">${km?km.toLocaleString('fr-FR')+' km':'—'}</span>
            ${pct!==null?`<span class="prec-badge ${precClass(pct)}">${pct}%</span>`:''}
          </div>
        </div>
        <div class="histo-right">
          <div class="histo-total">${p.total?p.total.toFixed(2)+' €':'—'}</div>
          <button class="btn-toggle" id="btnh${i}" onclick="toggleDetail('deth${i}','btnh${i}')">▾</button>
        </div>
      </div>
      <div class="detail-panel" id="deth${i}">
        <div class="detail-grid">
          <div><div class="detail-label">Date</div><div class="detail-val">${fd(p.date)}</div></div>
          <div><div class="detail-label">Station</div><div class="detail-val">${p.station||'—'}</div></div>
          <div><div class="detail-label">Km départ</div><div class="detail-val">${p.kmDepart?p.kmDepart.toLocaleString('fr-FR'):'-'}</div></div>
          <div><div class="detail-label">Km total</div><div class="detail-val">${p.kmTotal?p.kmTotal.toLocaleString('fr-FR'):'-'}</div></div>
          <div><div class="detail-label">Km parcourus</div><div class="detail-val">${km?km.toLocaleString('fr-FR')+' km':'—'}</div></div>
          <div><div class="detail-label">ODB annoncé</div><div class="detail-val">${p.estimPlein?p.estimPlein+' km':'—'}</div></div>
          <div><div class="detail-label">ODB restant</div><div class="detail-val">${p.estimRestante!=null?p.estimRestante+' km':'—'}</div></div>
          <div><div class="detail-label">Précision ODB</div><div class="detail-val">${pct!==null?`<span class="prec-badge ${precClass(pct)}">${pct}%</span>`:'—'}</div></div>
          <div><div class="detail-label">Total payé</div><div class="detail-val">${p.total?p.total.toFixed(2)+' €':'—'}</div></div>
          <div><div class="detail-label">Litres</div><div class="detail-val">${p.litres>0?p.litres.toFixed(2)+' L':'—'}</div></div>
          <div><div class="detail-label">Prix/L</div><div class="detail-val">${p.prixL>0?p.prixL.toFixed(3)+' €':'—'}</div></div>
          <div><div class="detail-label">Conso.</div><div class="detail-val">${conso(p)!==null?conso(p).toFixed(1)+' L/100':'—'}</div></div>
          <div><div class="detail-label">Coût/100km</div><div class="detail-val">${coutKm(p)!==null?coutKm(p).toFixed(2)+' €':'—'}</div></div>
          <div><div class="detail-label">Autonomie estimée</div><div class="detail-val">${autonomie(p)!==null?Math.round(autonomie(p)).toLocaleString('fr-FR')+' km':'—'}</div></div>
          <div><div class="detail-label">Type</div><div class="detail-val">${labelType(p.type)}</div></div>
        </div>
        <div class="detail-actions">
          <button class="btn-edit-d" onclick="ouvrirEdit(${p.id})">✏️ Modifier</button>
          <button class="btn-del-d" onclick="toggleDelConfirm('delc${i}')">🗑 Supprimer</button>
        </div>
        <div class="del-confirm" id="delc${i}">
          <p>Voulez-vous vraiment supprimer le plein du ${fd(p.date)} ?</p>
          <div class="del-btns">
            <button class="btn-del-ok" onclick="supprimerPlein(${p.id})">Confirmer</button>
            <button class="btn-del-no" onclick="toggleDelConfirm('delc${i}')">Annuler</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleDetail(panelId,btnId){
  const p=document.getElementById(panelId);
  const b=document.getElementById(btnId);
  const open=p.classList.toggle('open');
  b.classList.toggle('open',open);
  b.textContent=open?'▴':'▾';
  if(!open)p.querySelectorAll('.del-confirm').forEach(d=>d.style.display='none');
}

function toggleDelConfirm(id){
  const el=document.getElementById(id);
  el.style.display=el.style.display==='none'?'block':'none';
}

// ---- BADGE NAV ----
function updateBadge(){
  const n=data.filter(p=>p.kmTotal===null).length;
  const btn=document.getElementById('nav-histo');
  const ex=btn.querySelector('.nav-badge');if(ex)ex.remove();
  if(n>0){const b=document.createElement('span');b.className='nav-badge';b.textContent=n;btn.appendChild(b);}
}

// ---- KM AUTO ----
function refreshKmNotice(){
  const last=data.length?data[data.length-1]:null;
  const km=last?(last.kmTotal??last.kmDepart):null;
  const notice=document.getElementById('km-notice');
  const manual=document.getElementById('km-manual');
  if(km){notice.style.display='flex';document.getElementById('km-notice-val').textContent=km.toLocaleString('fr-FR');manual.style.display='none';}
  else{notice.style.display='none';manual.style.display='block';}
}

// ---- FAB + MODAL SAISIE ----
function openSaisie(){document.getElementById('modal-saisie').classList.add('open');}
function closeSaisie(e){
  if(e&&e.target!==document.getElementById('modal-saisie'))return;
  document.getElementById('modal-saisie').classList.remove('open');
}

// ---- SELECTION STATION ----
function onStationSelect(sel){
  const opt=sel.options[sel.selectedIndex];
  const manualField=document.getElementById('f-station-manual');
  const prixConfirm=document.getElementById('prix-confirm');
  if(sel.value==='autre'){manualField.style.display='block';prixConfirm.style.display='none';return;}
  manualField.style.display='none';
  if(sel.value&&opt.dataset.prix){
    const prix=parseFloat(opt.dataset.prix);
    const maj=opt.dataset.maj||'N/A';
    document.getElementById('prix-confirm-val').textContent=prix.toFixed(3)+' €/L';
    document.getElementById('prix-confirm-maj').textContent='Dernière mise à jour : '+maj;
    prixConfirm.style.display='block';
  }else{prixConfirm.style.display='none';}
}

function confirmerPrix(){
  const val=parseFloat(document.getElementById('prix-confirm-val').textContent);
  document.getElementById('f-prixL').value=val.toFixed(3);
  document.getElementById('prix-confirm').style.display='none';
  toast('Prix appliqué : '+val.toFixed(3)+' €/L');
}
function refuserPrix(){
  document.getElementById('prix-confirm').style.display='none';
  document.getElementById('f-prixL').value='';
  document.getElementById('f-prixL').focus();
}

// ---- PHASE 1 ----
async function ajouterPhase1(){
  const date=document.getElementById('f-date').value;
  const type=document.getElementById('f-type').value;
  const estim=parseFloat(document.getElementById('f-estim').value)||null;
  const total=parseFloat(document.getElementById('f-total').value)||0;
  const litres=parseFloat(document.getElementById('f-litres').value)||0;
  const prixL=parseFloat(document.getElementById('f-prixL').value)||0;
  if(!date){toast('Renseigne la date.',true);return;}

  // Station
  const sel=document.getElementById('f-station-select');
  let station='';
  if(sel.value==='autre'){station=document.getElementById('f-station-manual-input').value.trim();}
  else if(sel.value){station=sel.options[sel.selectedIndex].dataset.nom||'';}

  const last=data.length?data[data.length-1]:null;
  let kmDepart=last?(last.kmTotal??last.kmDepart):null;
  if(kmDepart===null){
    kmDepart=parseInt(document.getElementById('f-km-depart').value);
    if(isNaN(kmDepart)){toast('Renseigne le kilométrage de départ.',true);return;}
  }
  await addPlein({date,type,kmDepart,kmTotal:null,estimPlein:estim,estimRestante:null,total,litres,prixL,station,vehicule_id:currentVehicleId});
  await loadData();
  clearForm();
  document.getElementById('modal-saisie').classList.remove('open');
  toast('Plein enregistré ⏳');
}

// ---- PHASE 2 ----
function ouvrirPhase2(id){
  const p=data.find(x=>x.id===id);if(!p)return;
  openId=id;
  document.getElementById('modal-sub').innerHTML=`Plein du <strong>${fd(p.date)}</strong> · Départ : <strong>${p.kmDepart.toLocaleString('fr-FR')} km</strong>`+(p.estimPlein?` · ODB : <strong>${p.estimPlein} km</strong>`:'');
  document.getElementById('m-km-total').value='';
  document.getElementById('m-estim-restante').value='';
  document.getElementById('modal-p2').classList.add('open');
}
function closeModalP2(e){if(e&&e.target!==document.getElementById('modal-p2'))return;document.getElementById('modal-p2').classList.remove('open');openId=null;}
async function validerPhase2(){
  if(!openId)return;
  const kmTotal=parseInt(document.getElementById('m-km-total').value);
  const estimRestante=parseFloat(document.getElementById('m-estim-restante').value);
  if(isNaN(kmTotal)||kmTotal<=0){toast('Renseigne le kilométrage total.',true);return;}
  if(isNaN(estimRestante)){toast("Renseigne l'estimation restante.",true);return;}
  const p=data.find(x=>x.id===openId);
  if(kmTotal<=p.kmDepart){toast('Le km total doit être > km de départ.',true);return;}
  await completePhase2(openId,kmTotal,estimRestante);
  document.getElementById('modal-p2').classList.remove('open');
  openId=null;
  await loadData();
  toast('Phase 2 complétée ✓');
}

// ---- MODIFIER ----
function ouvrirEdit(id){
  const p=data.find(x=>x.id===id);if(!p)return;
  editId=id;
  document.getElementById('e-date').value=p.date;
  document.getElementById('e-type').value=p.type;
  document.getElementById('e-km-depart').value=p.kmDepart??'';
  document.getElementById('e-km-total').value=p.kmTotal??'';
  document.getElementById('e-estim-plein').value=p.estimPlein??'';
  document.getElementById('e-estim-restante').value=p.estimRestante??'';
  document.getElementById('e-total').value=p.total??'';
  document.getElementById('e-litres').value=p.litres>0?p.litres:'';
  document.getElementById('e-prixL').value=p.prixL>0?p.prixL:'';
  document.getElementById('e-station').value=p.station??'';
  document.getElementById('modal-edit').classList.add('open');
}
function closeModalEdit(e){if(e&&e.target!==document.getElementById('modal-edit'))return;document.getElementById('modal-edit').classList.remove('open');editId=null;}
async function repasserPhase1(){
  if(!editId)return;
  const p=data.find(x=>x.id===editId);if(!p)return;
  await updatePlein(editId,{...p,kmTotal:null,estimRestante:null});
  document.getElementById('modal-edit').classList.remove('open');editId=null;
  await loadData();toast('Repassé en Phase 1 ✓');
}
async function validerEdit(){
  if(!editId)return;
  const date=document.getElementById('e-date').value;
  const type=document.getElementById('e-type').value;
  const kmDepart=parseInt(document.getElementById('e-km-depart').value)||null;
  const kmTotal=document.getElementById('e-km-total').value!==''?parseInt(document.getElementById('e-km-total').value):null;
  const estimPlein=document.getElementById('e-estim-plein').value!==''?parseFloat(document.getElementById('e-estim-plein').value):null;
  const estimRestante=document.getElementById('e-estim-restante').value!==''?parseFloat(document.getElementById('e-estim-restante').value):null;
  const total=parseFloat(document.getElementById('e-total').value)||0;
  const litres=parseFloat(document.getElementById('e-litres').value)||0;
  const prixL=parseFloat(document.getElementById('e-prixL').value)||0;
  const station=document.getElementById('e-station').value.trim();
  if(!date){toast('Renseigne la date.',true);return;}
  await updatePlein(editId,{date,type,kmDepart,kmTotal,estimPlein,estimRestante,total,litres,prixL,station});
  document.getElementById('modal-edit').classList.remove('open');editId=null;
  await loadData();toast('Plein modifié ✓');
}

// ---- SUPPRIMER ----
async function supprimerPlein(id){
  await deletePlein(id);await loadData();toast('Plein supprimé');
}
async function clearAll(){
  if(!confirm('Effacer tout l\'historique ?'))return;
  await deleteAllPleins();await loadData();toast('Historique effacé');
}

// ---- MINI STATS ----
function updateMiniStats(){
  const dep=data.reduce((s,p)=>s+p.total,0);
  document.getElementById('h-total').textContent=dep.toFixed(2)+' €';
  const complets=data.filter(p=>p.kmTotal!==null);
  const avecPrix=data.filter(p=>p.prixL>0);
  document.getElementById('s-prixL').textContent=avecPrix.length?avecPrix[avecPrix.length-1].prixL.toFixed(3):'—';
  const avecKm=complets.filter(p=>kmParcourus(p)!=null);
  if(avecKm.length){
    document.getElementById('s-km-moy').textContent=Math.round(avecKm.reduce((s,p)=>s+kmParcourus(p),0)/avecKm.length);
    document.getElementById('s-dep-moy').textContent=(dep/data.length).toFixed(2);
  }else{document.getElementById('s-km-moy').textContent='—';document.getElementById('s-dep-moy').textContent='—';}
  const precVals=complets.map(p=>precision(p)).filter(v=>v&&v>0&&v<3);
  document.getElementById('s-prec').textContent=precVals.length?Math.round(precVals.reduce((a,b)=>a+b,0)/precVals.length*100)+'%':'—';
}

// ---- STATS ----
function populateYearFilter(){
  const sel=document.getElementById('stats-year');
  if(!sel)return;
  const annees=[...new Set(data.map(p=>p.date.slice(0,4)))].sort().reverse();
  const prev=sel.value;
  sel.innerHTML='<option value="all">Toutes les années</option>'+annees.map(a=>`<option value="${a}">${a}</option>`).join('');
  if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
}

function renderStats(){
  populateYearFilter();
  const sel=document.getElementById('stats-year');
  const annee=sel?sel.value:'all';
  const fdata=(annee&&annee!=='all')?data.filter(p=>p.date.slice(0,4)===annee):data;
  const complets=fdata.filter(p=>p.kmTotal!==null);
  const dep=fdata.reduce((s,p)=>s+p.total,0);
  const avecL=fdata.filter(p=>p.litres>0);const totL=avecL.reduce((s,p)=>s+p.litres,0);
  const avecP=fdata.filter(p=>p.prixL>0);const pMoy=avecP.length?avecP.reduce((s,p)=>s+p.prixL,0)/avecP.length:0;
  const kmTot=complets.filter(p=>kmParcourus(p)!=null).reduce((s,p)=>s+kmParcourus(p),0);
  document.getElementById('st-total').textContent=dep.toFixed(2);
  document.getElementById('st-litres').textContent=totL>0?totL.toFixed(1):'—';
  document.getElementById('st-prixmoy').textContent=pMoy>0?pMoy.toFixed(3):'—';
  document.getElementById('st-km').textContent=kmTot>0?kmTot.toLocaleString('fr-FR'):'—';
  const consoVals=complets.filter(p=>conso(p)!==null).map(p=>conso(p));
  const coutVals=complets.filter(p=>coutKm(p)!==null).map(p=>coutKm(p));
  document.getElementById('st-conso').textContent=consoVals.length?(consoVals.reduce((a,b)=>a+b,0)/consoVals.length).toFixed(1):'—';
  document.getElementById('st-cout').textContent=coutVals.length?(coutVals.reduce((a,b)=>a+b,0)/coutVals.length).toFixed(2):'—';
  document.getElementById('st-jours').textContent=joursMoyen(fdata)||'—';
  const proj=coutAnnuelProjecte(fdata);
  document.getElementById('st-proj').textContent=proj?proj.toLocaleString('fr-FR'):'—';
  renderChartDepense(fdata);renderChartPrix(fdata);renderChartKm(complets);renderChartConso(complets);renderChartMensuel(fdata);
}

// ---- FORM ----
function clearForm(){
  ['f-estim','f-total','f-litres','f-prixL','f-km-depart','f-station-manual-input'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('f-station-select').value='';
  document.getElementById('f-station-manual').style.display='none';
  document.getElementById('prix-confirm').style.display='none';
}

// ---- INIT ----
async function initApp(){
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  await loadVehicules();
  await loadTypes();
  try{ await loadFavoris(); }catch(e){}
  await loadData();
  updateStationDropdown();
}
initApp();
