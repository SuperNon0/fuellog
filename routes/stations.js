const express = require('express');
const router = express.Router();
const path = require('path');
const stationsNames = require(path.join(__dirname, '..', 'stations_name.json'));

const NOM_MAP = {
  'gazole': 'Diesel',
  'diesel': 'Diesel',
  'sp95': 'SP95',
  'e10': 'E10',
  'sp98': 'SP98',
  'e85': 'E85',
  'gplc': 'GPLc',
};

function mapNom(nom) {
  if (!nom) return null;
  const normalized = nom.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return NOM_MAP[normalized] || null;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function fetchOSMStations(lat, lng, rayonKm) {
  const query = `[out:json][timeout:15];(node["amenity"="fuel"](around:${rayonKm*1000},${lat},${lng});way["amenity"="fuel"](around:${rayonKm*1000},${lat},${lng}););out center tags;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
  const data = await res.json();
  return (data.elements || []).map(el => {
    const osLat = el.type === 'node' ? el.lat : el.center?.lat;
    const osLng = el.type === 'node' ? el.lon : el.center?.lon;
    const tags = el.tags || {};
    const nom = tags.brand || tags.name || tags.operator || null;
    const parts = [];
    if (tags['addr:housenumber'] && tags['addr:street']) parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
    else if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    const adresse = parts.length ? parts.join(', ') : null;
    return { lat: osLat, lng: osLng, nom, adresse };
  }).filter(s => s.lat && s.lng);
}

function enrichStation(s, osmStations) {
  if (!osmStations.length) return s;
  let nearest = null, minDist = Infinity;
  osmStations.forEach(osm => {
    const d = haversineM(s.lat, s.lng, osm.lat, osm.lng);
    if (d < minDist) { minDist = d; nearest = osm; }
  });
  if (!nearest || minDist > 150) return s;
  return {
    ...s,
    nom: nearest.nom || s.nom,
    adresse: nearest.adresse || s.adresse,
    lat: nearest.lat,
    lng: nearest.lng
  };
}

router.get('/', async (req, res) => {
  const { lat, lng, rayon = 40 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat et lng requis' });

  try {
    const govUrl = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&where=within_distance(geom%2CGEOM'POINT(${lng}%20${lat})'%2C${rayon}km)`;

    // Appels gouvernement + Overpass en parallèle
    const [govResponse, osmStations] = await Promise.all([
      fetch(govUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) }),
      fetchOSMStations(parseFloat(lat), parseFloat(lng), parseFloat(rayon)).catch(e => {
        console.error('Overpass (non-fatal):', e.message);
        return [];
      })
    ]);

    if (!govResponse.ok) throw new Error('HTTP ' + govResponse.status);
    const data = await govResponse.json();
    if (!data.results) return res.json({ stations: [] });

    const stations = data.results.map(s => {
      const sLat = s.geom ? s.geom.lat : parseInt(s.latitude, 10) / 100000;
      const sLng = s.geom ? s.geom.lon : parseInt(s.longitude, 10) / 100000;

      const prix = {};
      const addPrix = (key, val) => {
        const v = parseFloat(val);
        if (!isNaN(v) && v > 0.5 && v < 5) prix[key] = Math.round(v * 1000) / 1000;
      };
      addPrix('Diesel', s.gazole_prix);
      addPrix('E10', s.e10_prix);
      addPrix('SP95', s.sp95_prix);
      addPrix('SP98', s.sp98_prix);
      addPrix('E85', s.e85_prix);

      if (s.prix) {
        try {
          let prixArr = typeof s.prix === 'string' ? JSON.parse(s.prix) : s.prix;
          if (!Array.isArray(prixArr)) prixArr = [prixArr];
          prixArr.forEach(p => {
            const nomKey = mapNom(p['@nom']);
            if (!nomKey || prix[nomKey]) return;
            addPrix(nomKey, p['@valeur']);
          });
        } catch(e) {}
      }

      const R = 6371;
      const dLat = (sLat - parseFloat(lat)) * Math.PI / 180;
      const dLng = (sLng - parseFloat(lng)) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(lat)*Math.PI/180)*Math.cos(sLat*Math.PI/180)*Math.sin(dLng/2)**2;
      const dist = Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10;

      let maj = 'N/A';
      try {
        const majs = [s.gazole_maj, s.sp95_maj, s.e10_maj, s.sp98_maj, s.e85_maj].filter(Boolean);
        if (majs.length) {
          const latest = majs.sort().reverse()[0];
          const d = new Date(latest);
          if (!isNaN(d)) maj = d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        }
      } catch(e) {}

      const lookup = stationsNames[String(s.id)];
      const nom = (lookup && lookup.name) ||
                  (Array.isArray(s.enseignes) ? s.enseignes[0] : s.enseignes) ||
                  s.brand || s.nom ||
                  `Station ${s.ville||''}`.trim();
      const adresse = [s.adresse, s.cp, s.ville].filter(Boolean).join(', ');

      const base = { id: String(s.id), nom, adresse, ville: s.ville||'', lat: sLat, lng: sLng, dist, prix, maj, services: s.services||[] };
      return enrichStation(base, osmStations);
    })
    .filter(s => s.lat && s.lng && s.dist <= rayon)
    .sort((a, b) => a.dist - b.dist);

    res.json({ stations });
  } catch (err) {
    console.error('Erreur API stations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-id/:id', async (req, res) => {
  try {
    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=1&where=id=${encodeURIComponent(req.params.id)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data.results?.length) return res.json({ station: null });
    const s = data.results[0];
    const sLat = s.geom ? s.geom.lat : parseInt(s.latitude, 10) / 100000;
    const sLng = s.geom ? s.geom.lon : parseInt(s.longitude, 10) / 100000;
    const lookup = stationsNames[String(s.id)];
    const nom = (lookup && lookup.name) || (Array.isArray(s.enseignes) ? s.enseignes[0] : s.enseignes) || s.brand || s.nom || `Station ${s.ville||''}`.trim();
    const adresse = [s.adresse, s.cp, s.ville].filter(Boolean).join(', ');
    const prix = {};
    const addPrix = (key, val) => { const v = parseFloat(val); if (!isNaN(v) && v > 0.5 && v < 5) prix[key] = Math.round(v * 1000) / 1000; };
    addPrix('Diesel', s.gazole_prix);
    addPrix('E10', s.e10_prix);
    addPrix('SP95', s.sp95_prix);
    addPrix('SP98', s.sp98_prix);
    addPrix('E85', s.e85_prix);

    let base = { id: String(s.id), nom, adresse, ville: s.ville||'', lat: sLat, lng: sLng, prix, maj: 'N/A', services: [] };
    try {
      const osmStations = await fetchOSMStations(sLat, sLng, 0.2);
      base = enrichStation(base, osmStations);
    } catch(e) {}

    res.json({ station: base });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
