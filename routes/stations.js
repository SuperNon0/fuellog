const express = require('express');
const router = express.Router();
const path = require('path');
const stationsNames = require(path.join(__dirname, '..', 'stations_name.json'));

// Mapping des noms API vers nos clés internes
const NOM_MAP = {
  'gazole': 'Diesel',
  'diesel': 'Diesel',
  'sp95': 'SP95',
  'e10': 'SP95',
  'sp98': 'SP98',
  'e85': 'E85',
  'gplc': 'GPLc',
};

function mapNom(nom) {
  if (!nom) return null;
  const normalized = nom.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return NOM_MAP[normalized] || null;
}

router.get('/', async (req, res) => {
  const { lat, lng, rayon = 40 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat et lng requis' });

  try {
    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&where=within_distance(geom%2CGEOM'POINT(${lng}%20${lat})'%2C${rayon}km)`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data.results) return res.json({ stations: [] });

    const stations = data.results.map(s => {
      // Coordonnées : geom.lat/lon déjà en degrés décimaux
      const sLat = s.geom ? s.geom.lat : parseInt(s.latitude, 10) / 100000;
      const sLng = s.geom ? s.geom.lon : parseInt(s.longitude, 10) / 100000;

      // Prix : utiliser les champs plats gazole_prix, e10_prix, sp95_prix, sp98_prix, e85_prix
      const prix = {};
      const addPrix = (key, val) => {
        const v = parseFloat(val);
        if (!isNaN(v) && v > 0.5 && v < 5) prix[key] = Math.round(v * 1000) / 1000;
      };
      addPrix('Diesel', s.gazole_prix);
      addPrix('SP95', s.sp95_prix || s.e10_prix);
      addPrix('SP98', s.sp98_prix);
      addPrix('E85', s.e85_prix);

      // Fallback : parser le champ prix pour compléter les prix manquants
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

      // Distance
      const R = 6371;
      const dLat = (sLat - parseFloat(lat)) * Math.PI / 180;
      const dLng = (sLng - parseFloat(lng)) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(lat)*Math.PI/180)*Math.cos(sLat*Math.PI/180)*Math.sin(dLng/2)**2;
      const dist = Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10;

      // Date MAJ : prendre la plus récente parmi les champs plats
      let maj = 'N/A';
      try {
        const majs = [s.gazole_maj, s.sp95_maj, s.e10_maj, s.sp98_maj, s.e85_maj].filter(Boolean);
        if (majs.length) {
          const latest = majs.sort().reverse()[0];
          const d = new Date(latest);
          if (!isNaN(d)) maj = d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        }
      } catch(e) {}

      // Nom : lookup dans stations_name.json, fallback sur enseignes ou adresse
      const lookup = stationsNames[String(s.id)];
      const nom = (lookup && lookup.name) ||
                  (Array.isArray(s.enseignes) ? s.enseignes[0] : s.enseignes) ||
                  s.brand || s.nom ||
                  `Station ${s.ville||''}`.trim();
      const adresse = [s.adresse, s.cp, s.ville].filter(Boolean).join(', ');

      return {
        id: String(s.id),
        nom,
        adresse,
        ville: s.ville || '',
        lat: sLat,
        lng: sLng,
        dist,
        prix,
        maj,
        services: s.services || []
      };
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
    addPrix('SP95', s.sp95_prix || s.e10_prix);
    addPrix('SP98', s.sp98_prix);
    addPrix('E85', s.e85_prix);
    res.json({ station: { id: String(s.id), nom, adresse, ville: s.ville||'', lat: sLat, lng: sLng, prix, maj: 'N/A', services: [] } });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
