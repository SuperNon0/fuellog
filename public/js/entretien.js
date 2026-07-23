let entretiens = [];
let editEntretienId = null;

const CATEGORIES = ['Vidange', 'Pneus', 'Freins', 'Révision', 'Filtres', 'Batterie', 'Courroie', 'Climatisation', 'Carrosserie', 'Contrôle technique', 'Autre'];

async function initEntretien() {
  try { entretiens = await getEntretiens(); } catch (e) { entretiens = []; }
  renderEntretiens();
}

function renderEntretiens() {
  const el = document.getElementById('entretien-list');
  const totalEl = document.getElementById('entretien-total');
  const total = entretiens.reduce((s, e) => s + (e.cout || 0), 0);
  totalEl.textContent = `${entretiens.length} intervention${entretiens.length > 1 ? 's' : ''} · ${total.toFixed(2)} €`;

  if (!entretiens.length) {
    el.innerHTML = '<div class="no-data" style="padding:2rem;text-align:center;color:var(--muted);font-size:.78rem">🔧 Aucun entretien enregistré.<br>Ajoute ta première intervention.</div>';
    return;
  }

  el.innerHTML = entretiens.map(e => {
    const dt = fd(e.date);
    const files = (e.fichiers || []).map(f => {
      const isImg = f.mimetype && f.mimetype.startsWith('image/');
      const url = '/uploads/' + f.filename;
      if (isImg) {
        return `<div class="ent-file"><a href="${url}" target="_blank"><img src="${url}" alt=""></a>
          <button class="ent-file-del" onclick="supprimerFichier(${f.id})">×</button></div>`;
      }
      return `<div class="ent-file ent-file-pdf"><a href="${url}" target="_blank">📄<span>PDF</span></a>
        <button class="ent-file-del" onclick="supprimerFichier(${f.id})">×</button></div>`;
    }).join('');

    return `<div class="ent-card">
      <div class="ent-top">
        <div>
          <div class="ent-cat">${e.categorie || 'Entretien'}</div>
          <div class="ent-meta">${dt}${e.km != null ? ' · ' + e.km.toLocaleString('fr-FR') + ' km' : ''}</div>
        </div>
        <div class="ent-cout">${(e.cout || 0) > 0 ? (e.cout).toFixed(2) + ' €' : ''}</div>
      </div>
      ${e.commentaire ? `<div class="ent-comment">${escapeHtml(e.commentaire)}</div>` : ''}
      ${files ? `<div class="ent-files">${files}</div>` : ''}
      <div class="ent-actions">
        <button class="btn-edit-d" onclick="ouvrirEditEntretien(${e.id})">✏️ Modifier</button>
        <button class="btn-del-d" onclick="supprimerEntretien(${e.id})">🗑 Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function openEntretienModal() {
  editEntretienId = null;
  document.getElementById('ent-modal-title').textContent = 'Nouvel entretien';
  document.getElementById('ent-date').value = new Date().toISOString().split('T')[0];
  const last = data && data.length ? data[data.length - 1] : null;
  document.getElementById('ent-km').value = last ? (last.kmTotal ?? last.kmDepart ?? '') : '';
  fillCategories('');
  document.getElementById('ent-cout').value = '';
  document.getElementById('ent-commentaire').value = '';
  document.getElementById('ent-files-input').value = '';
  document.getElementById('modal-entretien').classList.add('open');
}

function fillCategories(selected) {
  const sel = document.getElementById('ent-categorie');
  sel.innerHTML = CATEGORIES.map(c => `<option${c === selected ? ' selected' : ''}>${c}</option>`).join('');
  if (selected && !CATEGORIES.includes(selected)) {
    sel.innerHTML += `<option selected>${escapeHtml(selected)}</option>`;
  }
}

function ouvrirEditEntretien(id) {
  const e = entretiens.find(x => x.id === id);
  if (!e) return;
  editEntretienId = id;
  document.getElementById('ent-modal-title').textContent = 'Modifier l\'entretien';
  document.getElementById('ent-date').value = e.date;
  document.getElementById('ent-km').value = e.km ?? '';
  fillCategories(e.categorie || '');
  document.getElementById('ent-cout').value = e.cout > 0 ? e.cout : '';
  document.getElementById('ent-commentaire').value = e.commentaire || '';
  document.getElementById('ent-files-input').value = '';
  document.getElementById('modal-entretien').classList.add('open');
}

function closeEntretienModal(ev) {
  if (ev && ev.target !== document.getElementById('modal-entretien')) return;
  document.getElementById('modal-entretien').classList.remove('open');
  editEntretienId = null;
}

async function validerEntretien() {
  const date = document.getElementById('ent-date').value;
  if (!date) { toast('Renseigne la date.', true); return; }
  const km = document.getElementById('ent-km').value !== '' ? parseInt(document.getElementById('ent-km').value) : null;
  const categorie = document.getElementById('ent-categorie').value;
  const cout = parseFloat(document.getElementById('ent-cout').value) || 0;
  const commentaire = document.getElementById('ent-commentaire').value.trim();
  const files = document.getElementById('ent-files-input').files;

  const btn = document.getElementById('ent-save-btn');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  try {
    let id = editEntretienId;
    if (id) {
      await updateEntretien(id, { date, km, categorie, commentaire, cout });
    } else {
      const r = await addEntretien({ date, km, categorie, commentaire, cout });
      id = r.id;
    }
    if (files && files.length) {
      btn.textContent = 'Envoi des fichiers…';
      await uploadEntretienFichiers(id, files);
    }
    document.getElementById('modal-entretien').classList.remove('open');
    editEntretienId = null;
    await initEntretien();
    toast('Entretien enregistré ✓');
  } catch (e) {
    toast('Erreur lors de l\'enregistrement.', true);
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
}

async function supprimerEntretien(id) {
  if (!confirm('Supprimer cet entretien et ses pièces jointes ?')) return;
  await deleteEntretien(id);
  await initEntretien();
  toast('Entretien supprimé');
}

async function supprimerFichier(fid) {
  if (!confirm('Supprimer cette pièce jointe ?')) return;
  await deleteEntretienFichier(fid);
  await initEntretien();
  toast('Pièce jointe supprimée');
}

function exporterCarnetPDF() {
  if (!entretiens.length) { toast('Aucun entretien à exporter.', true); return; }
  toast('Génération du PDF…');
  window.open('/api/entretiens/export/pdf', '_blank');
}
