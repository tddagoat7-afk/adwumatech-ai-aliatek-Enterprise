fetch('/competitors-integrated.js').then(r=>r.text()).then(code=>{
 code=code.replace("((sector==='hospital_system'||sector==='health_plan')?.045:.08+(seed%10)/100)","((sector==='hospital_system'||sector==='health_plan') ? .045 : .08+(seed%10)/100)");
 (0,eval)(code);
 const oldCompany=globalThis.companyI;
 globalThis.profileI=async name=>{const r=await fetch(`/api/company-profile?company=${encodeURIComponent(name)}`),d=await r.json();if(!r.ok)throw new Error(d.error||`Could not profile ${name}`);return d};
 globalThis.companyI=async function(name){
  const [profile,news]=await Promise.all([profileI(name).catch(()=>null),apiI(name).catch(()=>null)]);
  if(!profile&&!news)return oldCompany(name);
  const a=news?.analytics||{totals:{mentions:0},percentages:{positive:0,negative:0},scores:{reputation:50}},items=news?.items||[];
  const primary=profile?.leadership?.[0];
  const leadership=primary?{name:primary.name,confidence:primary.confidence,basis:`${primary.title} · official website`,url:primary.url}:{name:'Not confidently identified',confidence:0,basis:'No verified official leadership evidence'};
  const f=financeI(items,a.totals.mentions,profile?.industry?.sector||IC.sector);
  return{name,officialWebsite:profile?.officialWebsite||'',profile,leadership,mentions:a.totals.mentions,sentiment:Math.max(0,Math.min(100,Math.round(50+(a.percentages.positive||0)*.6-(a.percentages.negative||0)*.7))),reputation:a.scores.reputation||50,contracts:contractsI(name,items),...f};
 };
 const oldRender=globalThis.renderI;
 globalThis.renderI=function(){
  oldRender();
  const rows=IC.results||[];
  const table=document.querySelector('#icRows');
  if(table)table.querySelectorAll('tr').forEach((tr,i)=>{const x=rows[i],cell=tr.children?.[0];if(x?.officialWebsite&&cell){const a=document.createElement('a');a.href=x.officialWebsite;a.target='_blank';a.rel='noopener';a.className='ic-site-link';a.textContent='Official site ↗';cell.append(document.createElement('br'),a)}});
  let profilePanel=document.querySelector('#icProfile');
  if(!profilePanel){profilePanel=document.createElement('article');profilePanel.id='icProfile';profilePanel.className='panel ic-profile';const summary=document.querySelector('#icSummary');summary?.after(profilePanel)}
  const p=rows[0]?.profile;if(p){profilePanel.innerHTML=`<div class="panel-head"><div><small>OFFICIAL WEBSITE INTELLIGENCE</small><h3>${escI(p.company)} brand fingerprint</h3></div><a href="${escI(p.officialWebsite)}" target="_blank" rel="noopener">Visit official site ↗</a></div><div class="ic-profile-grid"><div><span>Industry</span><b>${escI((p.industry?.sector||'unknown').replaceAll('_',' '))}</b><small>${p.industry?.confidence||0}% confidence</small></div><div><span>Leadership found</span><b>${p.leadership?.length||0}</b><small>official-site evidence</small></div><div><span>Products/signals</span><b>${p.products?.length||0}</b><small>${escI((p.products||[]).slice(0,4).join(' · ')||'None extracted')}</small></div><div><span>Customer signals</span><b>${p.customers?.length||0}</b><small>${escI((p.customers||[]).slice(0,4).join(' · ')||'None extracted')}</small></div></div><p>${escI(p.description||'Official website profile built successfully.')}</p><div class="ic-source-line">Verified from ${p.sources?.length||0} official pages · website confidence ${p.websiteConfidence||0}%</div>`}
 };
 const oldScan=globalThis.scanI;
 globalThis.scanI=async function(){
  if(IC.busy)return;const q=(document.querySelector('#icCompany')?.value||document.querySelector('#companyInput')?.value||'').trim();if(q.length<2)return setStatusI('Enter an organization first.',true);
  IC.busy=true;document.querySelector('#icCompany').value=q;document.querySelector('#icScan').disabled=true;setStatusI('Discovering official website, leadership, products, customers and market peers…');
  try{const profile=await profileI(q);IC.sector=profile.industry?.sector||'unknown';IC.confidence=profile.industry?.confidence||0;const names=[q,...(profile.competitors||[]).map(x=>x.name).filter(x=>x.toLowerCase()!==q.toLowerCase()).slice(0,5)];const done=await Promise.allSettled(names.map(companyI));IC.results=done.filter(x=>x.status==='fulfilled').map(x=>x.value);if(!IC.results.length)throw new Error('No usable company profiles were returned.');renderI()}catch(e){setStatusI(e.message,true)}finally{IC.busy=false;document.querySelector('#icScan').disabled=false}
 };
}).catch(e=>console.error('Competitor intelligence failed to load',e));