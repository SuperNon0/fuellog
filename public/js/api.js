const API_PLEINS = '/api/pleins';
const API_FAVORIS = '/api/favoris';
const API_STATIONS = '/api/stations';

async function apiCall(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// Pleins
async function getPleins(vehiculeId) { return apiCall('GET', vehiculeId ? `${API_PLEINS}?vehicule=${vehiculeId}` : API_PLEINS); }
async function addPlein(p) { return apiCall('POST', API_PLEINS, p); }
async function updatePlein(id, p) { return apiCall('PUT', `${API_PLEINS}/${id}`, p); }
async function completePhase2(id, kmTotal, estimRestante) { return apiCall('PATCH', `${API_PLEINS}/${id}`, { kmTotal, estimRestante }); }
async function deletePlein(id) { return apiCall('DELETE', `${API_PLEINS}/${id}`); }
async function deleteAllPleins() { return apiCall('DELETE', API_PLEINS); }

// Favoris
async function getFavoris() { return apiCall('GET', API_FAVORIS); }
async function refreshFavorisPrix() { return apiCall('GET', `${API_FAVORIS}/refresh-prix`); }
async function addFavori(f) { return apiCall('POST', API_FAVORIS, f); }
async function renameFavori(id, nom) { return apiCall('PATCH', `${API_FAVORIS}/${id}`, { nom }); }
async function deleteFavori(id) { return apiCall('DELETE', `${API_FAVORIS}/${id}`); }

// Stations
async function getStations(lat, lng) { return apiCall('GET', `${API_STATIONS}?lat=${lat}&lng=${lng}`); }
async function getStationById(id) { return apiCall('GET', `${API_STATIONS}/by-id/${id}`); }

// Entretiens
const API_ENTRETIENS = '/api/entretiens';
async function getEntretiens(vehiculeId) { return apiCall('GET', vehiculeId ? `${API_ENTRETIENS}?vehicule=${vehiculeId}` : API_ENTRETIENS); }
async function addEntretien(e) { return apiCall('POST', API_ENTRETIENS, e); }
async function updateEntretien(id, e) { return apiCall('PUT', `${API_ENTRETIENS}/${id}`, e); }
async function deleteEntretien(id) { return apiCall('DELETE', `${API_ENTRETIENS}/${id}`); }
async function deleteEntretienFichier(fid) { return apiCall('DELETE', `${API_ENTRETIENS}/fichiers/${fid}`); }
async function uploadEntretienFichiers(id, files) {
  const fd = new FormData();
  for (const f of files) fd.append('fichiers', f);
  const res = await fetch(`${API_ENTRETIENS}/${id}/fichiers`, { method: 'POST', body: fd });
  return res.json();
}

// Véhicules
const API_VEHICULES = '/api/vehicules';
async function getVehicules() { return apiCall('GET', API_VEHICULES); }
async function addVehicule(v) { return apiCall('POST', API_VEHICULES, v); }
async function updateVehicule(id, v) { return apiCall('PUT', `${API_VEHICULES}/${id}`, v); }
async function deleteVehicule(id) { return apiCall('DELETE', `${API_VEHICULES}/${id}`); }

// Types d'entretien
const API_TYPES = '/api/types';
async function getTypes() { return apiCall('GET', API_TYPES); }
async function addType(nom) { return apiCall('POST', API_TYPES, { nom }); }
async function deleteType(id) { return apiCall('DELETE', `${API_TYPES}/${id}`); }

// Données (export / backup / import)
async function importBackup(backupObj) { return apiCall('POST', '/api/donnees/import', backupObj); }

// Système
async function getVersion() { return apiCall('GET', '/api/systeme/version'); }
async function checkUpdate() { return apiCall('GET', '/api/systeme/check'); }
async function launchUpdate() { return apiCall('POST', '/api/systeme/update'); }
async function getUpdateLog() { return apiCall('GET', '/api/systeme/update-log'); }
async function changePassword(password) { return apiCall('POST', '/api/systeme/password', { password }); }
async function getAuthSettings() { return apiCall('GET', '/api/systeme/auth-settings'); }
async function saveAuthSettings(s) { return apiCall('POST', '/api/systeme/auth-settings', s); }
