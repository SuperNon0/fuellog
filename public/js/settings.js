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
