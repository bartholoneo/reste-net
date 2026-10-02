/* Reste Net — interface. Dépend de rates.js (données) et calc.js (moteur). */
(function () {
  'use strict';
  const C = window.ResteNetCalc;
  const DEFAULTS = window.RESTE_NET_RATES;
  const LIC = window.LICENSE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const eur = (x) => (Number.isFinite(x) ? x : 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const pct = (x) => (Number.isFinite(x) ? x : 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Édition ---------- */
  function detectEdition() {
    if (window.RESTE_NET_EDITION === 'full') return 'full';
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('src') === 'msstore') { LS.set('resteNet.msstore', 1); return 'full'; }
    } catch (e) { /* ignore */ }
    if (LS.get('resteNet.msstore', 0) === 1) return 'full';
    const lic = LS.get('resteNet.license', null);
    if (lic && lic.key) return 'full';
    return 'free';
  }

  /* ---------- État ---------- */
  const DEFAULT_SELECTED_FULL = ['gumroad', 'polar', 'comeup', 'fiverr', 'itch', 'msstore', 'gplay', 'stripe', 'direct'];
  const state = {
    edition: detectEdition(),
    price: 5, nSales: 1, nWithdraw: 1, targetNet: 10,
    selected: [], options: {},
    statusId: 'particulier', tmi: 0, acre: false, vl: false, includeTax: true,
    settings: LS.get('resteNet.settings', { usdToEur: null, forceGross: false, platforms: {}, statuses: {} }),
  };
  state.selected = state.edition === 'full' ? DEFAULT_SELECTED_FULL.slice() : ['gumroad'];
  DEFAULTS.platforms.forEach((p) => {
    state.options[p.id] = {};
    (p.options || []).forEach((o) => { state.options[p.id][o.id] = !!o.default; });
  });

  /* Taux effectifs = défauts + surcharges utilisateur. */
  function rates() {
    const s = state.settings;
    const platforms = DEFAULTS.platforms.map((p) => {
      const o = (s.platforms && s.platforms[p.id]) || {};
      return Object.assign({}, p, {
        pct: o.pct != null ? o.pct : p.pct,
        fixed: o.fixed != null ? o.fixed : p.fixed,
        withdrawal: Object.assign({}, p.withdrawal, {
          fixed: o.wFixed != null ? o.wFixed : p.withdrawal.fixed,
          pct: o.wPct != null ? o.wPct : (p.withdrawal.pct || 0),
        }),
      });
    });
    const statuses = DEFAULTS.statuses.map((st) => Object.assign({}, st, (s.statuses && s.statuses[st.id]) || {}));
    return { platforms, statuses, usdToEur: s.usdToEur != null ? s.usdToEur : DEFAULTS.usdToEur, forceGross: !!s.forceGross };
  }

  function currentInput(platformId) {
    const r = rates();
    const status = state.edition === 'full' ? r.statuses.find((x) => x.id === state.statusId) : null;
    return {
      price: state.price, nSales: state.edition === 'full' ? state.nSales : 1, nWithdrawals: state.edition === 'full' ? state.nWithdraw : 1,
      usdToEur: r.usdToEur, options: state.options[platformId] || {}, status: status,
      tax: { acre: state.acre, versementLiberatoire: state.vl, tmi: state.tmi, includeTax: state.includeTax },
      forceGrossBasis: r.forceGross,
    };
  }

  function computeAll() {
    const r = rates();
    return r.platforms.filter((p) => state.selected.includes(p.id)).map((p) => C.compute(p, currentInput(p.id)));
  }

  /* ---------- Rendu : plateformes ---------- */
  function renderPlatformChips() {
    const r = rates();
    const multi = state.edition === 'full';
    $('platformsLegend').textContent = multi ? 'Plateformes à comparer' : 'Plateforme (une à la fois dans la version gratuite)';
    const groups = {};
    r.platforms.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
    $('platformChips').innerHTML = Object.keys(groups).map((g) => `
      <div class="chip-group"><span class="chip-group-label">${esc(g)}</span>
        ${groups[g].map((p) => `<label class="chip${state.selected.includes(p.id) ? ' on' : ''}${p.verified ? '' : ' nv'}" title="${esc(p.note)}">
          <input type="${multi ? 'checkbox' : 'radio'}" name="platform" value="${p.id}" ${state.selected.includes(p.id) ? 'checked' : ''}>
          <span>${esc(p.name)}</span>${p.verified ? '' : '<small>n.v.</small>'}</label>`).join('')}
      </div>`).join('');
    $('platformChips').querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (multi) {
          state.selected = Array.from($('platformChips').querySelectorAll('input:checked')).map((i) => i.value);
        } else {
          state.selected = [inp.value];
        }
        renderPlatformChips(); renderOptions(); renderAll();
      });
    });
  }

  function renderOptions() {
    const r = rates();
    const html = r.platforms.filter((p) => state.selected.includes(p.id) && (p.options || []).length).map((p) => `
      <div class="option-row"><strong>${esc(p.name)}</strong> ${p.options.map((o) => `
        <label><input type="checkbox" data-platform="${p.id}" data-option="${o.id}" ${state.options[p.id][o.id] ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`).join('');
    $('platformOptions').innerHTML = html;
    $('platformOptions').querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      state.options[inp.dataset.platform][inp.dataset.option] = inp.checked; renderAll();
    }));
  }

  /* ---------- Rendu : statut ---------- */
  function renderStatusControls() {
    const r = rates();
    $('status').innerHTML = r.statuses.map((s) => `<option value="${s.id}" ${s.id === state.statusId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('tmi').innerHTML = DEFAULTS.tmiChoices.map((t) => `<option value="${t}" ${t === state.tmi ? 'selected' : ''}>${t} %${t === 0 ? ' (non imposable)' : ''}</option>`).join('');
    const st = r.statuses.find((x) => x.id === state.statusId);
    $('vl').disabled = !st || st.versementLiberatoire == null;
    $('acre').disabled = !st || !st.social;
    $('statusNote').textContent = st ? st.note : '';
  }

  /* ---------- Rendu : résultats ---------- */
  function feeLabel(p, usd) {
    const parts = [];
    if (p.pct) parts.push(pct(p.pct));
    if (p.fixed) parts.push(p.fixedCurrency === 'USD' ? `${p.fixed.toLocaleString('fr-FR')} $ (≈ ${eur(C.toEur(p.fixed, 'USD', usd))})` : eur(p.fixed));
    return parts.length ? parts.join(' + ') : 'aucun';
  }

  function renderResults() {
    const r = rates();
    const results = computeAll();
    const full = state.edition === 'full';
    const monthly = full && state.nSales > 1;
    const key = monthly ? (x) => x.month.net : (x) => x.perSale.net;
    results.sort((a, b) => key(b) - key(a));
    if (!results.length) { $('results').innerHTML = '<p class="hint">Choisis au moins une plateforme.</p>'; $('resultsHint').textContent = ''; return; }

    $('results').innerHTML = results.map((res, i) => {
      const p = r.platforms.find((x) => x.id === res.platformId);
      const e = res.effective; const s = res.perSale; const m = res.month;
      const best = full && results.length > 1 && i === 0;
      const summary = `
        <span class="r-name">${best ? '<span class="star" title="Meilleur net">★</span>' : ''}${esc(p.name)}</span>
        <span class="r-net"><b>${eur(s.net)}</b><small>net par vente · ${(s.ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} % du prix</small></span>
        ${monthly ? `<span class="r-month"><b>${eur(m.net)}</b><small>net sur le mois (${state.nSales} ventes)</small></span>` : ''}`;
      const lines = [
        ['Prix payé par le client', eur(s.price)],
        [`Frais ${esc(p.name)} (${feeLabel(e, r.usdToEur)})`, '− ' + eur(s.platformFee)],
        ['Montant reversé', eur(s.received)],
      ];
      if (e.wPct) lines.push([`Frais variables de retrait (${pct(e.wPct)})`, '− ' + eur(s.withdrawalVar)]);
      if (full && res.socialRate != null) {
        lines.push([`Cotisations sociales (${pct(res.socialRate)} sur ${res.basis === 'gross' ? 'le prix client' : 'le montant reversé'})`, '− ' + eur(s.social)]);
        if (state.includeTax) {
          lines.push([state.vl ? 'Versement libératoire de l\'impôt' : `Impôt sur le revenu (TMI ${state.tmi} % après abattement)`, '− ' + eur(s.incomeTax)]);
          if (s.prelevements) lines.push(['Prélèvements sociaux (17,2 %)', '− ' + eur(s.prelevements)]);
        }
      }
      lines.push(['<b>Net par vente</b>', '<b>' + eur(s.net) + '</b>']);
      const monthLines = monthly ? [
        ['Encaissé sur le mois', eur(m.gross)],
        ['Frais de plateforme', '− ' + eur(m.platformFees)],
        [`Retraits et abonnements (${state.nWithdraw} retrait${state.nWithdraw > 1 ? 's' : ''} ; ${esc(p.withdrawal.label)})`, '− ' + eur(m.withdrawalFees)],
        ['Arrivé sur mon compte', eur(m.bank)],
        ['Cotisations (annualisé)', '− ' + eur(m.social)],
        ['Impôt et prélèvements (annualisé, abattement minimum appliqué)', '− ' + eur(m.incomeTax + m.prelevements)],
        ['<b>Net sur le mois</b>', '<b>' + eur(m.net) + '</b>'],
      ] : [];
      const warn = [];
      if (p.withdrawal.minimum && C.toEur(p.withdrawal.minimum, p.withdrawal.minimumCurrency, r.usdToEur) > (monthly ? m.received : s.received) && (monthly ? m.received : s.received) > 0) {
        warn.push(`Seuil de retrait ${p.withdrawal.minimum} ${p.withdrawal.minimumCurrency === 'USD' ? '$' : '€'} : l'argent attend d'atteindre le seuil.`);
      }
      if (!p.verified) warn.push('Taux non vérifiés dans l\'étude.');
      if (p.estimated) warn.push('Estimation pour : ' + p.estimated.join(', ') + '.');
      return `<details class="result${best ? ' best' : ''}" ${results.length === 1 ? 'open' : ''}>
        <summary>${summary}</summary>
        <div class="r-body">
          <table class="lines"><tbody>${lines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td></tr>`).join('')}</tbody></table>
          ${monthly ? `<table class="lines month"><tbody>${monthLines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td></tr>`).join('')}</tbody></table>` : ''}
          <p class="hint">${esc(p.note)} Retrait : ${esc(p.withdrawal.label)}.${warn.length ? ' <span class="warn">' + esc(warn.join(' ')) + '</span>' : ''}</p>
        </div></details>`;
    }).join('');
    $('resultsHint').innerHTML = full
      ? 'Impôt et prélèvements : estimés à ce rythme de ventes sur douze mois (abattement minimum de 305 € appliqué). Sur le mois : les frais fixes de retrait et les abonnements s\'ajoutent.'
      : `Hors frais fixes de retrait, cotisations et impôt. La <a href="${esc(buyUrl())}" target="_blank" rel="noopener">version complète</a> compare toutes les plateformes et ajoute ton statut.`;
  }

  function renderInverse() {
    if (state.edition !== 'full') return;
    const r = rates();
    const rows = r.platforms.filter((p) => state.selected.includes(p.id)).map((p) => {
      const price = C.inversePrice(p, currentInput(p.id), state.targetNet);
      const check = price == null ? null : C.compute(p, Object.assign({}, currentInput(p.id), { price: price })).perSale.net;
      return { name: p.name, price: price, check: check };
    }).sort((a, b) => (a.price == null ? 1e12 : a.price) - (b.price == null ? 1e12 : b.price));
    $('inverseResults').innerHTML = rows.length ? `<table class="compare"><thead><tr><th>Plateforme</th><th>Prix à afficher</th><th>Net obtenu</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.price == null ? '—' : '<b>' + eur(x.price) + '</b>'}</td><td>${x.check == null ? 'impossible' : eur(x.check)}</td></tr>`).join('')}</tbody></table>` : '';
  }

  /* ---------- Export, scénarios ---------- */
  function toCSV() {
    const res = computeAll();
    const head = ['Plateforme', 'Prix client', 'Frais plateforme', 'Montant reversé', 'Cotisations par vente', 'Impôt par vente', 'Net par vente', 'Ventes/mois', 'Encaissé/mois', 'Frais retraits/mois', 'Cotisations/mois', 'Impôt/mois', 'Net/mois'];
    const num = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
    const rows = res.map((x) => [x.platformName, num(x.perSale.price), num(x.perSale.platformFee), num(x.perSale.received), num(x.perSale.social), num(x.perSale.incomeTax + x.perSale.prelevements), num(x.perSale.net), state.nSales, num(x.month.gross), num(x.month.withdrawalFees), num(x.month.social), num(x.month.incomeTax + x.month.prelevements), num(x.month.net)]);
    const line = (arr) => arr.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';');
    return '﻿' + [line(head)].concat(rows.map(line)).join('\r\n');
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function snapshot() {
    return { price: state.price, nSales: state.nSales, nWithdraw: state.nWithdraw, targetNet: state.targetNet, selected: state.selected, options: state.options, statusId: state.statusId, tmi: state.tmi, acre: state.acre, vl: state.vl, includeTax: state.includeTax };
  }
  function restore(snap) {
    Object.assign(state, snap);
    $('price').value = state.price; $('nSales').value = state.nSales; $('nWithdraw').value = state.nWithdraw; $('targetNet').value = state.targetNet;
    $('acre').checked = state.acre; $('vl').checked = state.vl; $('includeTax').checked = state.includeTax;
    renderPlatformChips(); renderOptions(); renderStatusControls(); renderAll();
  }
  function renderScenarios() {
    const list = LS.get('resteNet.scenarios', []);
    $('scenarioList').innerHTML = list.length ? list.map((s) => `<li><span><b>${esc(s.name)}</b> <small>${esc(new Date(s.savedAt).toLocaleString('fr-FR'))}</small></span>
      <span><button type="button" class="btn-ghost" data-load="${s.id}">Charger</button> <button type="button" class="btn-ghost danger" data-del="${s.id}" aria-label="Supprimer ${esc(s.name)}">✕</button></span></li>`).join('') : '<li class="hint">Aucun scénario enregistré.</li>';
    $('scenarioList').querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => { const s = list.find((x) => x.id === b.dataset.load); if (s) restore(s.state); }));
    $('scenarioList').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { LS.set('resteNet.scenarios', list.filter((x) => x.id !== b.dataset.del)); renderScenarios(); }));
  }

  /* ---------- Paramètres ---------- */
  function renderSettings() {
    const r = rates();
    $('usdToEur').value = r.usdToEur; $('forceGross').checked = r.forceGross;
    const numField = (label, path, value, step, unit) => `<label class="s-field"><span>${label}</span><span class="input-unit"><input type="number" step="${step}" min="0" data-path="${path}" value="${value}"><em>${unit}</em></span></label>`;
    $('platformSettings').innerHTML = r.platforms.map((p) => `<div class="s-block"><h4>${esc(p.name)}</h4>
      ${numField('Commission', `platforms.${p.id}.pct`, p.pct, '0.1', '%')}
      ${numField('Fixe par vente', `platforms.${p.id}.fixed`, p.fixed, '0.01', p.fixedCurrency === 'USD' ? '$' : '€')}
      ${numField('Fixe par retrait', `platforms.${p.id}.wFixed`, p.withdrawal.fixed, '0.01', p.withdrawal.fixedCurrency === 'USD' ? '$' : '€')}
      ${numField('Variable au retrait', `platforms.${p.id}.wPct`, p.withdrawal.pct || 0, '0.1', '%')}
      <small class="hint">${esc(p.note)}</small></div>`).join('');
    $('statusSettings').innerHTML = r.statuses.map((s) => `<div class="s-block"><h4>${esc(s.name)}</h4>
      ${numField('Cotisations', `statuses.${s.id}.social`, s.social, '0.1', '%')}
      ${numField('Cotisations avec ACRE', `statuses.${s.id}.socialAcre`, s.socialAcre, '0.05', '%')}
      ${numField('CFP', `statuses.${s.id}.cfp`, s.cfp, '0.1', '%')}
      ${numField('Taxe chambre consulaire', `statuses.${s.id}.tfc`, s.tfc, '0.001', '%')}
      ${numField('Abattement IR', `statuses.${s.id}.abattement`, s.abattement, '1', '%')}
      ${numField('Abattement minimum', `statuses.${s.id}.abattementMin`, s.abattementMin, '1', '€')}
      ${s.versementLiberatoire != null ? numField('Versement libératoire', `statuses.${s.id}.versementLiberatoire`, s.versementLiberatoire, '0.1', '%') : ''}
      ${s.prelevementsSociaux ? numField('Prélèvements sociaux', `statuses.${s.id}.prelevementsSociaux`, s.prelevementsSociaux, '0.1', '%') : ''}
      <small class="hint">${esc(s.note)}</small></div>`).join('');
    $('settingsCard').querySelectorAll('[data-path]').forEach((inp) => inp.addEventListener('input', () => {
      const v = inp.value === '' ? null : Number(inp.value);
      const [kind, id, field] = inp.dataset.path.split('.');
      state.settings[kind] = state.settings[kind] || {};
      state.settings[kind][id] = state.settings[kind][id] || {};
      if (v == null || Number.isNaN(v)) delete state.settings[kind][id][field]; else state.settings[kind][id][field] = v;
      LS.set('resteNet.settings', state.settings); renderStatusControls(); renderAll();
    }));
    $('ratesMeta').textContent = `Taux version ${DEFAULTS.version}, plateformes vérifiées le ${DEFAULTS.verifiedOn}. Tes modifications sont gardées sur cet appareil.`;
  }

  /* ---------- Verrous (édition gratuite) ---------- */
  function buyUrl() { return LIC.buyUrlGumroad || LIC.buyUrlPolar || '#'; }
  function applyEdition() {
    const full = state.edition === 'full';
    document.documentElement.dataset.edition = state.edition;
    $('editionBadge').textContent = full ? 'Version complète' : 'Version gratuite';
    $('editionBadge').className = 'badge ' + (full ? 'badge-full' : 'badge-free');
    $('buyBtn').hidden = full; $('licenseBtn').hidden = full; $('footerBuy').hidden = full;
    [$('buyBtn'), $('footerBuy'), $('dialogBuy')].forEach((a) => { a.href = buyUrl(); });
    document.querySelectorAll('.full-only').forEach((el) => { el.hidden = !full; });
    document.querySelectorAll('.lockable').forEach((card) => {
      card.classList.toggle('locked', !full);
      card.querySelectorAll('input,select,button').forEach((el) => { el.disabled = !full; });
      let ov = card.querySelector('.lock-overlay');
      if (!full && !ov) {
        ov = document.createElement('div'); ov.className = 'lock-overlay';
        ov.innerHTML = `<div><strong>🔒 ${esc(card.dataset.lockTitle)}</strong><p>${esc(card.dataset.lockText)}</p><a class="btn-primary" href="${esc(buyUrl())}" target="_blank" rel="noopener">Version complète · 3 €</a> <button type="button" class="btn-ghost js-key">J'ai une clé</button></div>`;
        card.appendChild(ov);
        ov.querySelector('.js-key').addEventListener('click', openLicense);
      } else if (full && ov) { ov.remove(); }
    });
    if (full) { $('vl').disabled = false; renderStatusControls(); }
  }

  /* ---------- Licence ---------- */
  function openLicense() { $('licenseMsg').textContent = ''; $('licenseKey').value = ''; $('licenseDialog').showModal(); }
  async function verifyLicense(key) {
    const errors = [];
    if (LIC.polarOrganizationId) {
      try {
        const r = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, organization_id: LIC.polarOrganizationId }) });
        if (r.ok) { const d = await r.json(); if (d && (d.status === 'granted' || d.status === undefined)) return { provider: 'polar' }; errors.push('Polar : clé ' + d.status); }
        else errors.push('Polar : clé inconnue');
      } catch (e) { errors.push('Polar injoignable'); }
    }
    if (LIC.gumroadProductId) {
      try {
        const body = new URLSearchParams({ product_id: LIC.gumroadProductId, license_key: key, increment_uses_count: 'false' });
        const r = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body: body });
        const d = await r.json().catch(() => null);
        if (d && d.success && d.purchase && !d.purchase.refunded && !d.purchase.chargebacked && !d.purchase.disputed) return { provider: 'gumroad' };
        errors.push('Gumroad : clé inconnue ou remboursée');
      } catch (e) { errors.push('Gumroad injoignable'); }
    }
    if (!LIC.polarOrganizationId && !LIC.gumroadProductId) errors.push('La vérification en ligne n\'est pas encore activée : ouvre le fichier hors ligne reçu avec ton achat.');
    throw new Error(errors.join(' · '));
  }

  /* ---------- Thème ---------- */
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    LS.set('resteNet.theme', t || null);
  }

  /* ---------- Rendu global ---------- */
  function renderAll() { renderResults(); renderInverse(); }

  function bind() {
    const num = (id, key, min) => $(id).addEventListener('input', () => { const v = Number($(id).value); state[key] = Number.isFinite(v) ? Math.max(min, v) : min; renderAll(); });
    num('price', 'price', 0); num('nSales', 'nSales', 1); num('nWithdraw', 'nWithdraw', 0); num('targetNet', 'targetNet', 0);
    $('status').addEventListener('change', () => { state.statusId = $('status').value; renderStatusControls(); renderAll(); });
    $('tmi').addEventListener('change', () => { state.tmi = Number($('tmi').value); renderAll(); });
    ['acre', 'vl', 'includeTax'].forEach((id) => $(id).addEventListener('change', () => { state[id] = $(id).checked; renderAll(); }));
    $('usdToEur').addEventListener('input', () => { const v = Number($('usdToEur').value); state.settings.usdToEur = Number.isFinite(v) && v > 0 ? v : null; LS.set('resteNet.settings', state.settings); renderAll(); });
    $('forceGross').addEventListener('change', () => { state.settings.forceGross = $('forceGross').checked; LS.set('resteNet.settings', state.settings); renderAll(); });
    $('resetBtn').addEventListener('click', () => { state.settings = { usdToEur: null, forceGross: false, platforms: {}, statuses: {} }; LS.del('resteNet.settings'); renderSettings(); renderStatusControls(); renderPlatformChips(); renderAll(); });
    $('csvBtn').addEventListener('click', () => download('reste-net.csv', toCSV(), 'text/csv;charset=utf-8'));
    $('printBtn').addEventListener('click', () => { document.querySelectorAll('.result').forEach((d) => { d.open = true; }); window.print(); });
    $('saveBtn').addEventListener('click', () => {
      const name = ($('scenarioName').value || '').trim() || `Scénario ${eur(state.price)} · ${new Date().toLocaleDateString('fr-FR')}`;
      const list = LS.get('resteNet.scenarios', []);
      list.unshift({ id: String(Date.now()), name: name, savedAt: Date.now(), state: snapshot() });
      LS.set('resteNet.scenarios', list.slice(0, 50)); $('scenarioName').value = ''; renderScenarios();
    });
    $('themeBtn').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
    $('licenseBtn').addEventListener('click', openLicense);
    $('licenseCancel').addEventListener('click', () => $('licenseDialog').close());
    $('licenseForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const key = $('licenseKey').value.trim(); if (!key) return;
      $('licenseSubmit').disabled = true; $('licenseMsg').textContent = 'Vérification…';
      try {
        const ok = await verifyLicense(key);
        LS.set('resteNet.license', { key: key, provider: ok.provider, at: Date.now() });
        $('licenseMsg').textContent = 'Clé acceptée. Merci ! Rechargement…';
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        $('licenseMsg').textContent = 'Clé refusée. ' + e.message;
      } finally { $('licenseSubmit').disabled = false; }
    });
  }

  function init() {
    const theme = LS.get('resteNet.theme', null); if (theme) applyTheme(theme);
    try { const q = new URLSearchParams(location.search).get('theme'); if (q === 'light' || q === 'dark') document.documentElement.dataset.theme = q; } catch (e) { /* ignore */ }
    $('verifiedOn').textContent = DEFAULTS.verifiedOn;
    $('versionLabel').textContent = 'v' + DEFAULTS.version + (state.edition === 'full' ? ' · complète' : '');
    renderPlatformChips(); renderOptions(); renderStatusControls(); renderSettings(); renderScenarios();
    bind(); applyEdition(); renderAll();
    if (!window.RESTE_NET_SINGLE_FILE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
