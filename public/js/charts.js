let cD=null,cP=null,cK=null,cPrec=null,cM=null;

function baseOptions(){
  const gc='#2a2d35',tc='#6b6f7a',tf={family:'DM Mono',size:10};
  return{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:tc,font:tf},grid:{color:gc}},y:{ticks:{color:tc,font:tf},grid:{color:gc}}}};
}

function renderChartDepense(data){
  if(cD)cD.destroy();
  cD=new Chart(document.getElementById('cD'),{type:'bar',data:{labels:data.map(p=>fd(p.date)),datasets:[{data:data.map(p=>p.total||0),backgroundColor:'rgba(232,197,71,.7)',borderColor:'rgba(232,197,71,1)',borderWidth:1,borderRadius:4}]},options:{...baseOptions(),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(2)+' €'}}}}});
}

function renderChartPrix(data){
  if(cP)cP.destroy();
  cP=new Chart(document.getElementById('cP'),{type:'line',data:{labels:data.map(p=>fd(p.date)),datasets:[{data:data.map(p=>p.prixL>0?p.prixL:null),borderColor:'#4fc3a1',backgroundColor:'rgba(79,195,161,.08)',tension:.3,pointBackgroundColor:'#4fc3a1',pointRadius:4,fill:true,spanGaps:true}]},options:{...baseOptions(),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y?c.parsed.y.toFixed(3)+' €/L':'N/A'}}}}});
}

function renderChartKm(complets){
  if(cK)cK.destroy();
  cK=new Chart(document.getElementById('cK'),{type:'bar',data:{labels:complets.map(p=>fd(p.date)),datasets:[{data:complets.map(p=>kmParcourus(p)),backgroundColor:'rgba(232,124,71,.7)',borderColor:'rgba(232,124,71,1)',borderWidth:1,borderRadius:4}]},options:{...baseOptions(),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+' km'}}}}});
}

function renderChartMensuel(data){
  if(cM)cM.destroy();
  const byMonth={};
  data.forEach(p=>{const m=p.date.substring(0,7);byMonth[m]=(byMonth[m]||0)+(p.total||0);});
  const keys=Object.keys(byMonth).sort();
  const noms=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const labels=keys.map(k=>{const[y,mo]=k.split('-');return noms[parseInt(mo)-1]+' '+y.substring(2);});
  cM=new Chart(document.getElementById('cM'),{type:'bar',data:{labels,datasets:[{data:keys.map(k=>parseFloat(byMonth[k].toFixed(2))),backgroundColor:'rgba(167,139,250,.7)',borderColor:'rgba(167,139,250,1)',borderWidth:1,borderRadius:4}]},options:{...baseOptions(),plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(2)+' €'}}}}});
}

function renderChartPrecision(precData){
  if(cPrec)cPrec.destroy();
  const vals=precData.map(x=>Math.round(x.v*100));
  const max=Math.max(...vals);
  const colors=vals.map(v=>v>=95?'rgba(79,195,161,.75)':v>=85?'rgba(232,197,71,.75)':'rgba(232,124,71,.75)');
  cPrec=new Chart(document.getElementById('cPrec'),{type:'bar',data:{labels:precData.map(x=>fd(x.p.date)),datasets:[{data:vals,backgroundColor:colors,borderColor:colors.map(c=>c.replace('.75)','.95)')),borderWidth:1,borderRadius:4},{type:'line',data:Array(vals.length).fill(100),borderColor:'rgba(232,92,71,.5)',borderDash:[6,4],borderWidth:1.5,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'%'}}},scales:{x:{ticks:{color:'#6b6f7a',font:{family:'DM Mono',size:10}},grid:{color:'#2a2d35'}},y:{ticks:{color:'#6b6f7a',font:{family:'DM Mono',size:10},callback:v=>v+'%'},grid:{color:'#2a2d35'},min:0,max:Math.max(130,max+10)}}}});
}
