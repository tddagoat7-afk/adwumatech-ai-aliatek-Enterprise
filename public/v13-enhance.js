import('/competitors-integrated-v5.js');
for(const href of ['/v13-enhance.css','/competitors-integrated.css','/galaxy-v14.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}
const A={data:null};
const originalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{const r=await originalFetch(...args);try{const u=String(args[0]||'');if(u.includes('/api/search')){const clone=r.clone(),d=await clone.json();if(r.ok){A.data=d;setTimeout(()=>enhance(d),120)}}}catch{}return r};