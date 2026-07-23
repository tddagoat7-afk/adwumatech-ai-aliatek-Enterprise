import dns from 'node:dns/promises';

const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map();
const UA = 'Aliatek-Enterprise-Intelligence/13.1 (+website research)';
const BLOCKED = new Set(['facebook.com','linkedin.com','instagram.com','x.com','twitter.com','youtube.com','wikipedia.org','crunchbase.com','bloomberg.com','reuters.com','zoominfo.com']);
const PAGE_HINTS = ['about','company','leadership','team','executive','founder','management','who-we-are','solutions','services','products','customers','case-studies','partners','news','press','careers','contact','investors','president','administration','trustees'];
const TITLES = ['president and chief executive officer','founder and chief executive officer','co-founder and chief executive officer','chief executive officer','chief executive','ceo','president','founder','co-founder','managing director','executive director','managing partner','chief medical officer','chief operating officer','chief technology officer','chief financial officer','provost','chancellor','superintendent','chairman'];
const TLDS = ['com','org','net','io','ai','co','health','care','edu','gov','us','co.uk','org.uk','com.gh','org.gh','edu.gh','com.ng','co.za','com.au','ca'];
const ENTITY_WORDS = /\b(inc|incorporated|llc|ltd|limited|plc|corp|corporation|company|group|holdings|college|university|school|academy|foundation|institute|institution|system)\b/gi;

const SECTORS = {
  health_plan:['health plan','managed care','medicare advantage','medicaid','payer','member benefits'],
  value_based_care:['value-based care','value based care','population health','aco','risk-bearing','care management','whole-person care'],
  chronic_care:['chronic care','chronic condition','pain management','remote patient monitoring','diabetes management'],
  home_health:['home health','in-home care','home-based care','skilled nursing at home'],
  hospital_system:['hospital','medical center','health system','clinic network'],
  healthcare_it:['healthcare software','ehr','electronic health record','clinical platform','revenue cycle'],
  pharma:['pharmaceutical','biotech','therapeutics','clinical trial','drug development'],
  technology:['software','cloud platform','artificial intelligence','cybersecurity','semiconductor'],
  banking:['banking','bank','credit union','lending','investment bank'],
  insurance:['insurance','insurer','underwriting','claims'],
  education:['university','college','school','academy','higher education','students','faculty','campus','academic'],
  retail:['retail','e-commerce','consumer products'],
  logistics:['logistics','freight','shipping','supply chain'],
  professional_services:['consulting','professional services','advisory'],
  nonprofit:['nonprofit','charity','foundation','ngo']
};

const clean = (s='') => String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
const uniq = a => [...new Set(a.filter(Boolean))];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
const safeName = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function domainStems(company) {
  const raw = slug(company);
  const reduced = slug(company.replace(ENTITY_WORDS,' '));
  const words = company.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
  const first = words[0] || '';
  return uniq([raw,reduced,first]).filter(x => x.length >= 3);
}

function isBlockedIp(address) {
  return address.startsWith('10.') || address.startsWith('127.') || address.startsWith('169.254.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
}

async function safeUrl(raw) {
  const u = new URL(raw);
  if (!['http:','https:'].includes(u.protocol)) throw Error('Unsupported protocol');
  const h = u.hostname.toLowerCase().replace(/^www\./,'');
  if (h === 'localhost' || h.endsWith('.local')) throw Error('Blocked host');
  const ips = await dns.lookup(h,{all:true});
  if (ips.some(({address}) => isBlockedIp(address))) throw Error('Blocked network');
  return u;
}

async function fetchPage(raw, timeout=10000) {
  const u = await safeUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(u,{redirect:'follow',signal:controller.signal,headers:{'user-agent':UA,accept:'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.5'}});
    if (!response.ok) throw Error(`${response.status}`);
    const type = response.headers.get('content-type') || '';
    const body = (await response.text()).slice(0,1500000);
    return {html:body,url:response.url,type};
  } finally { clearTimeout(timer); }
}

function links(html,base) {
  const out=[];
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try { const u=new URL(m[1],base); if (u.protocol.startsWith('http')) out.push(u.toString()); } catch {}
  }
  return uniq(out);
}
function meta(html,key) { const re=new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["']`,'i'),m=html.match(re); return clean(m?.[1]||m?.[2]||''); }
function title(html) { return clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''); }
function jsonLd(html) { const rows=[]; for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { const v=JSON.parse(m[1]); rows.push(...(Array.isArray(v)?v:[v])); } catch {} } return rows.flatMap(v=>v?.['@graph']||v).filter(Boolean); }

function scoreDomain(company,url,text='') {
  const h=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  const base=h.split('.')[0].replace(/[^a-z0-9]/g,'');
  const stems=domainStems(company);
  let n=0;
  if (stems.includes(base)) n+=90;
  if (stems.some(s=>base.includes(s)||s.includes(base))) n+=45;
  if (text.toLowerCase().includes(company.toLowerCase())) n+=25;
  if (/\.(edu|gov)$/.test(h)) n+=8;
  if (BLOCKED.has(h)||[...BLOCKED].some(x=>h.endsWith('.'+x))) n-=120;
  return n;
}

function searchResultLinks(html,base) {
  const out=[...links(html,base)];
  for (const m of html.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi)) out.push(clean(m[1]));
  for (const m of html.matchAll(/(?:url|u)=((?:https?%3A%2F%2F)[^&"']+)/gi)) { try { out.push(decodeURIComponent(m[1])); } catch {} }
  return uniq(out);
}

async function discoverDomain(company) {
  const direct=[];
  for (const stem of domainStems(company)) for (const tld of TLDS) direct.push(`https://${stem}.${tld}`);
  const candidates=[];
  for (const u of direct.slice(0,60)) {
    try { const p=await fetchPage(u,5500); candidates.push({url:p.url,html:p.html,score:scoreDomain(company,p.url,`${title(p.html)} ${meta(p.html,'description')}`)}); } catch {}
  }
  for (const endpoint of [
    `https://www.bing.com/search?format=rss&q=${encodeURIComponent(`"${company}" official website`)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(`"${company}" official website`)}`
  ]) {
    try { const p=await fetchPage(endpoint,9000); for (const u of searchResultLinks(p.html,p.url).slice(0,120)) { try { const h=new URL(u).hostname.replace(/^www\./,''); if (!BLOCKED.has(h)) candidates.push({url:u,score:scoreDomain(company,u,u)}); } catch {} } } catch {}
  }
  candidates.sort((a,b)=>b.score-a.score);
  for (const c of candidates.slice(0,20)) {
    try {
      const p=c.html?c:await fetchPage(c.url,7500);
      const score=scoreDomain(company,p.url,`${title(p.html)} ${meta(p.html,'description')} ${clean(p.html).slice(0,5000)}`);
      if (score>=45) return {domain:new URL(p.url).origin,homeUrl:p.url,html:p.html,confidence:Math.min(99,score)};
    } catch {}
  }
  return null;
}

function classify(text) {
  const t=text.toLowerCase(); let best={sector:'unknown',score:0,signals:[]};
  for (const [sector,keys] of Object.entries(SECTORS)) { const hit=keys.filter(k=>t.includes(k)),score=hit.reduce((n,k)=>n+(k.includes(' ')?3:1),0); if (score>best.score) best={sector,score,signals:hit.slice(0,8)}; }
  return {...best,confidence:Math.min(98,best.score*14)};
}

function extractLeaders(company,pages) {
  const candidates=[];
  for (const p of pages) {
    const text=p.text.slice(0,120000),official=p.type==='official';
    for (const titleName of TITLES) {
      const tt=safeName(titleName);
      const patterns=[new RegExp(`([A-Z][A-Za-z'’.-]+(?:\\s+[A-Z][A-Za-z'’.-]+){1,3})\\s*(?:,|—|-|\\|)\\s*(?:${tt})`,'gi'),new RegExp(`(?:${tt})\\s*(?:is|:|—|-)?\\s*([A-Z][A-Za-z'’.-]+(?:\\s+[A-Z][A-Za-z'’.-]+){1,3})`,'gi')];
      for (const re of patterns) for (const m of text.matchAll(re)) { const name=(m[1]||'').trim(); if (name&&name.length<70&&!/^(The|Our|About|Company|Leadership|Team|Health|Care|Board|Meet|Executive|Office)\b/i.test(name)) candidates.push({name,title:titleName.replace(/\b\w/g,c=>c.toUpperCase()),url:p.url,source:p.label,confidence:official?94:76}); }
    }
  }
  const map=new Map(); for (const x of candidates) { const k=x.name.toLowerCase(); if (!map.has(k)||map.get(k).confidence<x.confidence) map.set(k,x); }
  return [...map.values()].sort((a,b)=>b.confidence-a.confidence).slice(0,12);
}
function listSignals(text,groups) { const t=text.toLowerCase(); return groups.filter(x=>t.includes(x.toLowerCase())).slice(0,20); }
function financialSignals(text) { const grab=re=>{const m=text.match(re);return m?`${m[1]}${m[2]?' '+m[2]:''}`:null}; return {reportedRevenue:grab(/(?:annual )?revenue[^$\d]{0,35}\$?([\d,.]+)\s*(billion|million|bn|m)\b/i),reportedProfit:grab(/(?:net income|net profit)[^$\d]{0,35}\$?([\d,.]+)\s*(billion|million|bn|m)\b/i),funding:grab(/(?:raised|funding|financing)[^$\d]{0,35}\$?([\d,.]+)\s*(billion|million|bn|m)\b/i),employees:grab(/([\d,.]+)\s*(thousand|million|k|m)?\s+employees\b/i)}; }
function pageRecord(url,html,type='official') { const text=clean(html),ld=jsonLd(html); return {url,label:title(html)||new URL(url).pathname||new URL(url).hostname,type,description:meta(html,'description')||meta(html,'og:description'),text,structured:ld}; }

async function crawlOfficial(found) {
  const origin=new URL(found.homeUrl).origin,home=pageRecord(found.homeUrl,found.html);
  const ranked=links(found.html,found.homeUrl).filter(u=>{try{return new URL(u).origin===origin}catch{return false}}).map(u=>({u,score:PAGE_HINTS.reduce((n,k)=>n+(u.toLowerCase().includes(k)?1:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score);
  const selected=uniq([found.homeUrl,...ranked.slice(0,20).map(x=>x.u)]).slice(0,16),pages=[];
  for (const u of selected) { try { if (u===found.homeUrl) pages.push(home); else { const p=await fetchPage(u,8000); pages.push(pageRecord(p.url,p.html)); } } catch {} }
  return pages;
}

function competitorsFromText(company,text,sector) {
  const names=[];
  for (const m of text.matchAll(/(?:competitors?|alternatives?|versus|compared with|similar to|alongside)\s+(?:include|are|such as|like)?\s*([A-Z][A-Za-z0-9&.'’-]+(?:\s+[A-Z][A-Za-z0-9&.'’-]+){0,4})/g)) names.push(m[1].trim());
  const fallback={
    value_based_care:['Aledade','Cityblock Health','Oak Street Health','Signify Health','CareBridge','Author Health','Monogram Health'],
    chronic_care:['PonosCare','Omada Health','Virta Health','Teladoc Health','Hinge Health','DarioHealth'],
    home_health:['CenterWell Home Health','Amedisys','Aveanna Healthcare','Enhabit','AccentCare'],
    health_plan:['UnitedHealth Group','Elevance Health','Cigna','Centene','Humana'],
    healthcare_it:['Epic Systems','Oracle Health','athenahealth','Innovaccer','Waystar'],
    hospital_system:['HCA Healthcare','Mayo Clinic','Cleveland Clinic','CommonSpirit Health','Ascension'],
    education:['Howard University','Spelman College','Clark Atlanta University','Hampton University','Tuskegee University'],
    technology:['Microsoft','Google','Amazon','Oracle','IBM']
  }[sector]||[];
  return uniq([...names,...fallback]).filter(x=>x.toLowerCase()!==company.toLowerCase()).slice(0,10).map((name,i)=>({name,similarity:Math.max(58,94-i*5),reason:i<names.length?'Named in market-comparison evidence':`Matched ${sector.replaceAll('_',' ')} business model`}));
}

export function registerCompanyIntelligence(app) {
  app.get('/api/company-profile',async(req,res)=>{
    const company=clean(req.query.company||req.query.q||'');
    if (company.length<2) return res.status(400).json({error:'Enter a company or organization.'});
    const key=company.toLowerCase(),hit=cache.get(key);
    if (hit&&Date.now()-hit.time<CACHE_TTL) return res.json({...hit.data,cached:true});
    try {
      const found=await discoverDomain(company);
      if (!found) return res.status(404).json({error:`No official website could be verified for ${company}.`,code:'OFFICIAL_SITE_NOT_FOUND'});
      const pages=await crawlOfficial(found);
      const combined=pages.map(p=>`${p.label} ${p.description} ${p.text}`).join(' ').slice(0,900000);
      const industry=classify(combined),leadership=extractLeaders(company,pages);
      const products=listSignals(combined,['platform','software','mobile app','care management','remote patient monitoring','analytics','consulting','insurance','home-based care','value-based care','population health','chronic pain','behavioral health','primary care','telehealth','artificial intelligence','undergraduate','graduate programs','liberal arts','research']);
      const customers=listSignals(combined,['health plans','employers','providers','health systems','patients','members','government','medicare','medicaid','enterprises','small businesses','universities','students','alumni']);
      const partners=listSignals(combined,['Microsoft','Google','Amazon Web Services','AWS','Oracle','Epic','Salesforce','NVIDIA','health plans','health systems']);
      const financials=financialSignals(combined),competitors=competitorsFromText(company,combined,industry.sector);
      const data={version:'13.1.0',company,officialWebsite:found.domain,websiteConfidence:found.confidence,industry,description:pages[0]?.description||pages[0]?.text.slice(0,320)||'',leadership,products,customers,partners,financials:{...financials,status:financials.reportedRevenue||financials.reportedProfit?'reported signals found':'private/undisclosed; estimates require external evidence'},competitors,sources:pages.map(p=>({url:p.url,label:p.label,type:'official website',confidence:95,lastVerified:new Date().toISOString()})),cached:false};
      cache.set(key,{time:Date.now(),data}); res.json(data);
    } catch(e) { res.status(502).json({error:`Website intelligence failed: ${e.message}`}); }
  });
}
