function estimAverages() {
  const complets = data.filter(p => p.kmTotal !== null);
  const consoVals = complets.filter(p => conso(p) !== null).map(p => conso(p));
  const consoMoy = consoVals.length ? consoVals.reduce((a, b) => a + b, 0) / consoVals.length : null;
  const avecP = data.filter(p => p.prixL > 0);
  const prixMoy = avecP.length ? avecP.reduce((s, p) => s + p.prixL, 0) / avecP.length : null;
  const avecL = data.filter(p => p.litres > 0);
  const litresMoy = avecL.length ? avecL.reduce((s, p) => s + p.litres, 0) / avecL.length : null;
  return { consoMoy, prixMoy, litresMoy };
}

function initEstimation() {
  const sel = document.getElementById('estim-vehicule');
  if (sel) {
    sel.innerHTML = vehicules.map(v => `<option value="${v.id}"${v.id === currentVehicleId ? ' selected' : ''}>🚗 ${escapeHtml(v.nom)}</option>`).join('');
  }
  renderEstimationBase();
  calculerEstimation();
}

function estimVehiculeChange(id) {
  switchVehicle(id).then(() => { renderVehiculeSelect(); initEstimation(); });
}

function renderEstimationBase() {
  const { consoMoy, prixMoy } = estimAverages();
  document.getElementById('estim-conso-moy').textContent = consoMoy != null ? consoMoy.toFixed(1) + ' L/100km' : '—';
  document.getElementById('estim-prix-moy').textContent = prixMoy != null ? prixMoy.toFixed(3) + ' €/L' : '—';
}

function calculerEstimation() {
  const { consoMoy, prixMoy, litresMoy } = estimAverages();
  const res = document.getElementById('estim-results');
  const warn = document.getElementById('estim-warn');
  if (consoMoy == null || prixMoy == null) {
    res.style.display = 'none';
    warn.style.display = 'block';
    warn.textContent = "Pas assez de données pour ce véhicule. Ajoute des pleins avec les litres et le prix au litre pour obtenir une estimation.";
    return;
  }
  warn.style.display = 'none';
  const km = parseFloat(document.getElementById('estim-km').value);
  if (!km || km <= 0) { res.style.display = 'none'; return; }
  res.style.display = 'grid';
  const litres = (km / 100) * consoMoy;
  const cout = litres * prixMoy;
  document.getElementById('estim-litres').textContent = litres.toFixed(1);
  document.getElementById('estim-cout').textContent = cout.toFixed(2);
  const pleins = litresMoy ? litres / litresMoy : null;
  document.getElementById('estim-pleins').textContent = pleins ? (pleins < 1 ? pleins.toFixed(1) : Math.round(pleins)) : '—';
}
