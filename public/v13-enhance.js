import('/competitors-integrated-v6.js');
for(const href of ['/v13-enhance.css','/competitors-integrated.css','/galaxy-v14.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}
const relabel=()=>{document.querySelectorAll('.metric').forEach(card=>{const label=card.querySelector(':scope > span'),small=card.querySelector(':scope > small');if(label?.textContent.trim()==='Crisis Risk'){label.textContent='Negative Pressure';if(small)small.textContent='Weighted negative connotation'}});document.querySelectorAll('.report-metrics span').forEach(x=>{if(x.textContent.trim()==='Risk')x.textContent='Negative Pressure'})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',relabel);else relabel();
const A={data:null};
const originalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{const r=await originalFetch(...args);try{const u=String(args[0]||'');if(u.includes('/api/search')){const clone=r.clone(),d=await clone.json();if(r.ok){A.data=d;setTimeout(()=>{relabel();enhance(d)},120)}}}catch{}return r};