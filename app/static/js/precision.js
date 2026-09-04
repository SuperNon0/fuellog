function getPrecisionData(data){
  return data.filter(p=>p.kmTotal!==null).map(p=>({p,v:precision(p)})).filter(x=>x.v&&x.v>0&&x.v<3);
}

function renderPrecision(data){
  const precData=getPrecisionData(data);
  if(!precData.length){
    document.getElementById('gauge-pct').textContent='—';
    document.getElementById('prec-desc').textContent='Complète la Phase 2 d\'un plein pour voir l\'analyse.';
    document.getElementById('prec-table').innerHTML='<div class="no-data">Pas encore de données</div>';
    return;
  }
  const vals=precData.map(x=>Math.round(x.v*100));
  const moy=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  const min=Math.min(...vals),max=Math.max(...vals);
  document.getElementById('gauge-pct').textContent=moy+'%';
  const circ=233;
  document.getElementById('gauge-circle').style.strokeDashoffset=circ-(circ*Math.min(moy,100)/100);
  document.getElementById('gauge-circle').style.stroke=moy>=95?'#4fc3a1':moy>=85?'#e8c547':'#e87c47';
  const interp=moy>=100?`Ton ODB est <em>légèrement optimiste</em>.`:moy>=92?`Ton ODB est <em>très fiable</em>.`:moy>=80?`Ton ODB est <em>raisonnablement précis</em>.`:`Ton ODB est <em>peu fiable</em>.`;
  document.getElementById('prec-desc').innerHTML=`${precData.length} pleins · Moy. <strong>${moy}%</strong> · Min <strong>${min}%</strong> · Max <strong>${max}%</strong><br>${interp}`;
  renderChartPrecision(precData);
  const th='padding:.6rem .75rem;font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:var(--surface);border-bottom:1px solid var(--border)';
  const td='padding:.6rem .75rem;font-size:.74rem;border-bottom:1px solid var(--border)';
  document.getElementById('prec-table').innerHTML=`<table style="width:100%"><thead><tr><th style="${th}">Date</th><th style="${th}">Km dep.</th><th style="${th}">Km tot.</th><th style="${th}">Km parcourus</th><th style="${th}">ODB annoncé</th><th style="${th}">ODB restant</th><th style="${th}">Précision</th></tr></thead><tbody>${[...precData].reverse().map(({p,v})=>{const km=kmParcourus(p);const pct=Math.round(v*100);const col=precisionColor(v);return`<tr><td style="${td}">${fd(p.date)}</td><td style="${td}">${p.kmDepart.toLocaleString('fr-FR')}</td><td style="${td}">${p.kmTotal.toLocaleString('fr-FR')}</td><td style="${td}"><strong>${km.toLocaleString('fr-FR')}</strong></td><td style="${td}">${p.estimPlein}</td><td style="${td}">${p.estimRestante}</td><td style="${td}"><span class="prec-badge ${pct>=95?'prec-green':pct>=85?'prec-yellow':'prec-orange'}">${pct}%</span></td></tr>`;}).join('')}</tbody></table>`;
}
