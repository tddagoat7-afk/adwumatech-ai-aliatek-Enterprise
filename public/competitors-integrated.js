(() => {
  'use strict';

  const root = window.Aliatek = window.Aliatek || {};
  const app = root.competitors = root.competitors || {};
  app.state = app.state || { days: 30, busy: false, results: [], profile: null };
  const S = app.state;

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact = n => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
  const money = n => !n ? 'Undisclosed' : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;

  async function json(url) {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Intelligence request failed.');
    return d;
  }

  function inject() {
    if ($('#competitors')) return;
    const evidence = $('#evidence');
    if (!evidence) return;

    const nav = $('.sidebar nav');
    if (nav && !nav.querySelector('[data-target="competitors"]')) {
      const button = document.createElement('button');
      button.className = 'nav-btn';
      button.dataset.target = 'competitors';
      button.textContent = 'Competitors';
      const evidenceButton = nav.querySelector('[data-target="evidence"]');
      nav.insertBefore(button, evidenceButton || null);
    }

    const section = document.createElement('section');
    section.id = 'competitors';
    section.className = 'ic-section ic-reveal';
    section.innerHTML = `
      <div class="ic-orbit one"></div><div class="ic-orbit two"></div>
      <div class="section-head"><div><small>COMPETITOR INTELLIGENCE</small><h3>Official-site research, leadership and verified market peers.</h3></div><button id="icScan" class="cta compact" type="button">Build comparison <span>→</span></button></div>
      <div class="ic-controls"><label><span>⌕</span><input id="icCompany" placeholder="Uses your Command search, or enter another organization"></label><div class="ic-periods"><button data-days="7">7D</button><button class="active" data-days="30">30D</button><button data-days="90">90D</button></div></div>
      <div id="icStatus" class="ic-status"><i></i><span>Run a company search to build its official website profile.</span></div>
      <div id="icProfile" class="ic-profile"><div class="empty">No official website profile loaded.</div></div>
      <div id="icSummary" class="ic-summary"></div>
      <article class="panel ic-table-panel"><div class="panel-head"><div><small>ENTERPRISE COMPARISON</small><h3>Closest verified market peers</h3></div><span class="tag">WEBSITE-FIRST</span></div><div class="ic-table-wrap"><table><thead><tr><th>Organization</th><th>Leadership</th><th>Confidence</th><th>Sentiment</th><th>Mentions</th><th>Revenue</th><th>Profit</th><th>Contracts</th></tr></thead><tbody id="icRows"><tr><td colspan="8" class="empty">No comparison generated yet.</td></tr></tbody></table></div></article>
      <article class="panel"><div class="panel-head"><div><small>CONTRACT INTELLIGENCE</small><h3>Deals, awards and partnerships</h3></div></div><div id="icContracts" class="ic-contracts"><div class="empty">No contract evidence loaded.</div></div></article>`;
    evidence.parentNode.insertBefore(section, evidence);

    $('#icScan').addEventListener('click', scan);
    $('#icCompany').addEventListener('keydown', e => { if (e.key === 'Enter') scan(); });
    $$('.ic-periods button').forEach(b => b.addEventListener('click', () => {
      $$('.ic-periods button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      S.days = Number(b.dataset.days);
    }));

    const main = $('#companyInput');
    if (main) main.addEventListener('input', () => { if (document.activeElement !== $('#icCompany')) $('#icCompany').value = main.value; });

    $$('.sidebar .nav-btn').forEach(b => b.addEventListener('click', () => {
      const target = document.getElementById(b.dataset.target);
      if (!target) return;
      $$('.sidebar .nav-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $('#pageTitle').textContent = b.textContent;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    const observer = new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('seen')), { threshold: .12 });
    observer.observe(section);
    section.querySelectorAll('.panel').forEach(x => observer.observe(x));
  }

  function status(text, bad = false) {
    const el = $('#icStatus');
    if (!el) return;
    el.classList.toggle('bad', bad);
    el.querySelector('span').textContent = text;
  }

  function bestLeader(profile) {
    return profile?.leadership?.[0] || { name: 'Not confidently identified', title: 'Leadership not published', confidence: 0, url: profile?.officialWebsite || '' };
  }

  function numericFinancial(value) {
    if (!value) return 0;
    const m = String(value).match(/[\d,.]+/);
    if (!m) return 0;
    let n = Number(m[0].replace(/,/g, ''));
    const t = String(value).toLowerCase();
    if (t.includes('billion') || /\bbn\b/.test(t)) n *= 1e9;
    else if (t.includes('million') || /\bm\b/.test(t)) n *= 1e6;
    return n;
  }

  function contracts(name, items = []) {
    return items.filter(x => /contract|deal|award|agreement|partnership|procurement|grant|funding|selected by|collaboration/i.test(`${x.title} ${x.description}`)).slice(0, 12).map(x => ({ name, title: x.title, source: x.source, url: x.url }));
  }

  async function analyzeCompany(name, suppliedProfile = null) {
    const [profile, news] = await Promise.all([
      suppliedProfile ? Promise.resolve(suppliedProfile) : json(`/api/company-profile?company=${encodeURIComponent(name)}`),
      json(`/api/search?company=${encodeURIComponent(name)}&days=${S.days}&market=global`).catch(() => ({ items: [], analytics: { totals: { mentions: 0 }, percentages: { positive: 0, negative: 0 }, scores: { reputation: 50 } } }))
    ]);
    const a = news.analytics;
    const leader = bestLeader(profile);
    return {
      name,
      profile,
      leader,
      mentions: a?.totals?.mentions || 0,
      sentiment: Math.max(0, Math.min(100, Math.round(50 + (a?.percentages?.positive || 0) * .6 - (a?.percentages?.negative || 0) * .7))),
      reputation: a?.scores?.reputation ?? 50,
      revenue: numericFinancial(profile.financials?.reportedRevenue),
      profit: numericFinancial(profile.financials?.reportedProfit),
      contracts: contracts(name, news.items)
    };
  }

  async function scan() {
    if (S.busy) return;
    const q = ($('#icCompany')?.value || $('#companyInput')?.value || '').trim();
    if (q.length < 2) return status('Enter an organization first.', true);
    S.busy = true;
    $('#icCompany').value = q;
    $('#icScan').disabled = true;
    status('Finding the official website and building a verified company profile…');

    try {
      const profile = await json(`/api/company-profile?company=${encodeURIComponent(q)}`);
      S.profile = profile;
      const peers = (profile.competitors || []).slice(0, 5).map(x => x.name);
      const names = [q, ...peers.filter(x => x.toLowerCase() !== q.toLowerCase())];
      const settled = await Promise.allSettled(names.map((name, i) => analyzeCompany(name, i === 0 ? profile : null)));
      S.results = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
      if (!S.results.length) throw new Error('No usable company profiles were returned.');
      render();
    } catch (e) {
      status(e.message, true);
    } finally {
      S.busy = false;
      $('#icScan').disabled = false;
    }
  }

  function renderProfile(profile) {
    const leader = bestLeader(profile);
    const sector = profile.industry?.sector?.replaceAll('_', ' ') || 'Unknown';
    $('#icProfile').innerHTML = `
      <article class="ic-profile-card">
        <div><span>Verified website</span><a href="${esc(profile.officialWebsite)}" target="_blank" rel="noopener">${esc(profile.officialWebsite)}</a><small>${profile.websiteConfidence || 0}% domain confidence</small></div>
        <div><span>Classification</span><strong>${esc(sector.replace(/\b\w/g, c => c.toUpperCase()))}</strong><small>${profile.industry?.confidence || 0}% evidence confidence</small></div>
        <div><span>Top leadership</span><strong>${esc(leader.name)}</strong><small>${esc(leader.title)} · ${leader.confidence || 0}%</small></div>
        <div><span>Official pages reviewed</span><strong>${profile.sources?.length || 0}</strong><small>Website evidence sources</small></div>
      </article>
      <p class="ic-description">${esc(profile.description || 'No official description was published.')}</p>`;
  }

  function render() {
    const rows = S.results;
    const primary = rows[0];
    renderProfile(primary.profile);
    const sector = primary.profile.industry?.sector?.replaceAll('_', ' ') || 'Unknown';
    const verified = rows.filter(x => x.leader.confidence >= 70).length;
    status(`Compared ${rows.length} organizations using official-site profiles first.`);
    $('#icSummary').innerHTML = [
      ['Competitive leader', [...rows].sort((a,b) => b.reputation-a.reputation)[0]?.name || primary.name, `${Math.max(...rows.map(x=>x.reputation))}/100 reputation`],
      ['Sub-industry', sector.replace(/\b\w/g,c=>c.toUpperCase()), `${primary.profile.industry?.confidence || 0}% confidence`],
      ['Leadership verified', verified, `of ${rows.length} organizations`]
    ].map(x => `<article><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');

    $('#icRows').innerHTML = rows.map((x, i) => `<tr>
      <td>${i === 0 ? '<span class="badge">Searched</span> ' : ''}${esc(x.name)}<small><a href="${esc(x.profile.officialWebsite)}" target="_blank" rel="noopener">Official website</a></small></td>
      <td><b>${esc(x.leader.name)}</b><small>${esc(x.leader.title)}</small></td>
      <td>${x.leader.confidence || 0}%</td><td>${x.sentiment}/100</td><td>${compact(x.mentions)}</td>
      <td>${money(x.revenue)}<small>${x.revenue ? 'reported signal' : 'private / undisclosed'}</small></td>
      <td>${money(x.profit)}<small>${x.profit ? 'reported signal' : 'private / undisclosed'}</small></td><td>${x.contracts.length}</td>
    </tr>`).join('');

    const allContracts = rows.flatMap(x => x.contracts);
    $('#icContracts').innerHTML = allContracts.length ? allContracts.map(x => `<article><div><b>${esc(x.name)}</b><small>${esc(x.source || 'Public source')}</small></div><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></article>`).join('') : '<div class="empty">No contract-related evidence found in this period.</div>';
    $('#competitors').classList.add('data-ready');
  }

  app.scan = scan;
  app.render = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();