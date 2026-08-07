// ---- ÉTAT GLOBAL VÉHICULES ----
let vehicules = [];
let currentVehicleId = parseInt(localStorage.getItem('fuellog_vehicule')) || null;
let entretienTypes = [];
let editVehiculeId = null;

async function loadVehicules() {
  vehicules = await getVehicules();
  // Si aucun véhicule courant valide, prendre le premier
  if (!currentVehicleId || !vehicules.some(v => v.id === currentVehicleId)) {
    currentVehicleId = vehicules.length ? vehicules[0].id : null;
    if (currentVehicleId) localStorage.setItem('fuellog_vehicule', currentVehicleId);
  }
  renderVehiculeSelect();
}

function renderVehiculeSelect() {
  const sel = document.getElementById('vehicule-select');
  if (!sel) return;
  sel.innerHTML = vehicules.map(v => `<option value="${v.id}"${v.id === currentVehicleId ? ' selected' : ''}>🚗 ${escapeHtml(v.nom)}</option>`).join('');
}

async function switchVehicle(id) {
  currentVehicleId = parseInt(id);
  localStorage.setItem('fuellog_vehicule', currentVehicleId);
  await loadData();
  const estimTab = document.getElementById('tab-estimation');
  if (estimTab && estimTab.classList.contains('active')) initEstimation();
  toast('Véhicule : ' + (vehicules.find(v => v.id === currentVehicleId)?.nom || ''));
}

// ---- TYPES D'ENTRETIEN ----
async function loadTypes() {
  entretienTypes = await getTypes();
  return entretienTypes;
}

// ---- PAGE PARAMÈTRES ----
async function initParametres() {
  await loadVehicules();
  await loadTypes();
  renderParametres();
  renderVersion();
}

function renderParametres() {
  // Véhicules
  const vl = document.getElementById('param-vehicules');
  vl.innerHTML = vehicules.map(v => {
    const sub = [[v.marque, v.modele].filter(Boolean).join(' '), v.immatriculation, v.annee].filter(Boolean).join(' · ');
    return `<div class="param-item">
      <div class="param-item-main">
        <div class="param-item-nom">${escapeHtml(v.nom)}${v.id === currentVehicleId ? ' <span class="param-actif">actif</span>' : ''}</div>
        ${sub ? `<div class="param-item-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <div class="param-item-actions">
        <button onclick="ouvrirEditVehicule(${v.id})">✏️</button>
        <button onclick="supprimerVehicule(${v.id})">🗑</button>
      </div>
    </div>`;
  }).join('');

  // Types d'entretien
  const tl = document.getElementById('param-types');
  tl.innerHTML = entretienTypes.map(t => `<div class="param-chip">${escapeHtml(t.nom)}<button onclick="supprimerType(${t.id})">×</button></div>`).join('')
    || '<div class="param-empty">Aucun type. Ajoute-en un.</div>';
}

// ---- CRUD VÉHICULES ----
function ouvrirNouveauVehicule() {
  editVehiculeId = null;
  document.getElementById('veh-modal-title').textContent = 'Nouveau véhicule';
  ['veh-nom', 'veh-marque', 'veh-modele', 'veh-immat', 'veh-annee'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-vehicule').classList.add('open');
}

function ouvrirEditVehicule(id) {
  const v = vehicules.find(x => x.id === id);
  if (!v) return;
  editVehiculeId = id;
  document.getElementById('veh-modal-title').textContent = 'Modifier le véhicule';
  document.getElementById('veh-nom').value = v.nom || '';
  document.getElementById('veh-marque').value = v.marque || '';
  document.getElementById('veh-modele').value = v.modele || '';
  document.getElementById('veh-immat').value = v.immatriculation || '';
  document.getElementById('veh-annee').value = v.annee || '';
  document.getElementById('modal-vehicule').classList.add('open');
}

function closeVehiculeModal(ev) {
  if (ev && ev.target !== document.getElementById('modal-vehicule')) return;
  document.getElementById('modal-vehicule').classList.remove('open');
  editVehiculeId = null;
}

async function validerVehicule() {
  const nom = document.getElementById('veh-nom').value.trim();
  if (!nom) { toast('Donne un nom au véhicule.', true); return; }
  const v = {
    nom,
    marque: document.getElementById('veh-marque').value.trim(),
    modele: document.getElementById('veh-modele').value.trim(),
    immatriculation: document.getElementById('veh-immat').value.trim(),
    annee: parseInt(document.getElementById('veh-annee').value) || null
  };
  if (editVehiculeId) await updateVehicule(editVehiculeId, v);
  else {
    const r = await addVehicule(v);
    currentVehicleId = r.id;
    localStorage.setItem('fuellog_vehicule', currentVehicleId);
  }
  document.getElementById('modal-vehicule').classList.remove('open');
  editVehiculeId = null;
  await loadVehicules();
  renderParametres();
  await loadData();
  toast('Véhicule enregistré ✓');
}

async function supprimerVehicule(id) {
  if (vehicules.length <= 1) { toast('Tu dois garder au moins un véhicule.', true); return; }
  const v = vehicules.find(x => x.id === id);
  if (!confirm(`Supprimer "${v?.nom}" ?\nSes pleins et entretiens seront rattachés à un autre véhicule (rien n'est perdu).`)) return;
  const r = await deleteVehicule(id);
  if (r.error) { toast(r.error, true); return; }
  if (currentVehicleId === id) { currentVehicleId = null; localStorage.removeItem('fuellog_vehicule'); }
  await loadVehicules();
  renderParametres();
  await loadData();
  toast('Véhicule supprimé');
}

// ---- EXPORT / SAUVEGARDE / IMPORT ----
function exporterCSV(type) {
  const q = currentVehicleId ? '?vehicule=' + currentVehicleId : '';
  window.open(`/api/donnees/csv/${type}${q}`, '_blank');
  toast('Export CSV…');
}

function exporterBackup() {
  window.open('/api/donnees/backup', '_blank');
  toast('Téléchargement de la sauvegarde…');
}

function declencherImport() {
  if (!confirm('⚠️ Restaurer une sauvegarde REMPLACE toutes les données actuelles (véhicules, pleins, entretiens, favoris).\n\nContinuer ?')) return;
  document.getElementById('import-file-input').click();
}

async function importerBackup(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  toast('Lecture du fichier…');
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const r = await importBackup(obj);
    if (r.error) { toast(r.error, true); return; }
    // Repartir proprement sur le premier véhicule restauré
    currentVehicleId = null;
    localStorage.removeItem('fuellog_vehicule');
    await loadVehicules();
    await loadTypes();
    await loadData();
    renderParametres();
    toast(`Restauré : ${r.vehicules} véhicule(s), ${r.pleins} plein(s) ✓`);
  } catch (e) {
    toast('Fichier invalide ou illisible.', true);
  }
}

// ---- MISE À JOUR ----
async function renderVersion() {
  const el = document.getElementById('param-version');
  const btn = document.getElementById('btn-update');
  if (!el) return;
  try {
    const v = await getVersion();
    let txt = v.commit ? `Version ${v.commit}` : 'Version inconnue';
    if (v.branch) txt += ` · ${v.branch}`;
    if (v.date) txt += ` · ${v.date}`;
    el.textContent = txt;
    if (btn) btn.style.display = v.updateEnabled ? '' : 'none';
    if (!v.updateEnabled && el) el.textContent += ' · (mise à jour auto désactivée)';
  } catch (e) { el.textContent = 'Version indisponible'; }
}

async function changerMotDePasse() {
  const input = document.getElementById('param-newpass');
  const pw = input.value;
  if (!pw || pw.length < 8) { toast('Mot de passe : 8 caractères minimum.', true); return; }
  const r = await changePassword(pw);
  if (r.error) { toast(r.error, true); return; }
  input.value = '';
  toast('Mot de passe modifié ✓');
}

function seDeconnecter() {
  if (!confirm('Se déconnecter du panel ?')) return;
  window.location.href = '/logout';
}

async function voirJournalUpdate() {
  const box = document.getElementById('update-log-box');
  box.style.display = 'block';
  box.textContent = 'Chargement…';
  try {
    const r = await getUpdateLog();
    box.textContent = r.log || '(vide)';
  } catch (e) { box.textContent = 'Impossible de lire le journal.'; }
}

async function mettreAJour() {
  if (!confirm("Lancer la mise à jour ? L'application va se recharger dans ~30 secondes.")) return;
  const btn = document.getElementById('btn-update');
  btn.disabled = true; btn.textContent = 'Mise à jour en cours…';
  try {
    const r = await launchUpdate();
    if (r.error) { toast(r.error, true); btn.disabled = false; btn.textContent = "⬆️ Mettre à jour l'application"; return; }
    toast(r.message || 'Mise à jour lancée…');
    setTimeout(() => location.reload(), 30000);
  } catch (e) {
    toast('Erreur au lancement de la mise à jour.', true);
    btn.disabled = false; btn.textContent = "⬆️ Mettre à jour l'application";
  }
}

// ---- CRUD TYPES ----
async function ajouterType() {
  const input = document.getElementById('param-type-input');
  const nom = input.value.trim();
  if (!nom) return;
  const r = await addType(nom);
  if (r.error) { toast(r.error, true); return; }
  input.value = '';
  await loadTypes();
  renderParametres();
  toast('Type ajouté ✓');
}

async function supprimerType(id) {
  await deleteType(id);
  await loadTypes();
  renderParametres();
}
