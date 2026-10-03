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
  const int = (x) => (Number.isFinite(x) ? x : 0).toLocaleString('fr-FR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Aides : un texte court reste visible, un texte plus long se replie derrière un clic (relecture de Marius, 03/10). */
  const MORE_MAX = 100;
  const more = (label, html) => `<details class="more"><summary>${esc(label)}</summary><div class="more-body">${html}</div></details>`;
  const note = (text, label) => (text && text.length > MORE_MAX) ? more(label || 'En savoir plus', `<p class="hint">${esc(text)}</p>`) : (text ? `<p class="hint">${esc(text)}</p>` : '');
  const days = (d) => {
    if (d == null) return '—';
    if (d <= 0) return 'le jour même';
    if (d < 30) return `≈ ${d} jour${d > 1 ? 's' : ''}`;
    const m = Math.floor(d / 30), r = d % 30;
    if (m >= 12) return `≈ ${Math.round(d / 30)} mois (${Math.round(d / 365 * 10) / 10} an${d >= 730 ? 's' : ''})`;
    return `≈ ${m} mois${r >= 7 ? ` et ${r} jours` : ''}`;
  };

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
    price: 5, nSales: 1, nWithdraw: 1, targetNet: 10, targetMonthly: 100, fixedCosts: 0, otherIncome: 0,
    selected: [], options: {}, comparePlatform: 'best',
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
  const selectedPlatforms = () => rates().platforms.filter((p) => state.selected.includes(p.id));
  const currentStatus = () => rates().statuses.find((x) => x.id === state.statusId) || null;

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
    const monthly = state.edition === 'full' && state.nSales > 1;
    const key = monthly ? (x) => x.month.net : (x) => x.perSale.net;
    return selectedPlatforms().map((p) => C.compute(p, currentInput(p.id))).sort((a, b) => key(b) - key(a));
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
        if (multi) state.selected = Array.from($('platformChips').querySelectorAll('input:checked')).map((i) => i.value);
        else state.selected = [inp.value];
        renderPlatformChips(); renderOptions(); renderCompareSelect(); renderAll();
      });
    });
  }

  function renderOptions() {
    const r = rates();
    const withOptions = r.platforms.filter((p) => state.selected.includes(p.id) && (p.options || []).length);
    $('platformOptionsWrap').hidden = !withOptions.length;
    $('platformOptions').innerHTML = withOptions.map((p) => `
      <div class="option-row"><strong>${esc(p.name)}</strong> ${p.options.map((o) => `
        <label><input type="checkbox" name="opt-${p.id}-${o.id}" data-platform="${p.id}" data-option="${o.id}" ${state.options[p.id][o.id] ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`).join('');
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
    $('statusNote').innerHTML = st ? note(st.note, 'À savoir sur ce statut') : '';
    const b = DEFAULTS.irBrackets;
    const txt = b.map((x, i) => `<li>${x.rate} % ${x.upTo == null ? `au-delà de ${int(b[i - 1].upTo)} €` : `jusqu'à ${int(x.upTo)} €`}</li>`).join('');
    $('tmiHint').innerHTML = more('Voir le barème 2026', `<p class="hint">Barème 2026 (revenus 2025), par part de quotient familial :</p><ul class="hint list">${txt}</ul>`);
  }
  function autoTmi() {
    if (!(state.otherIncome > 0)) return;
    const r = computeAll();
    const annualTaxable = r.length ? Math.max(0, r[0].month.caBase * 12 * (1 - (currentStatus() ? currentStatus().abattement / 100 : 0))) : 0;
    state.tmi = C.tmiFor(DEFAULTS.irBrackets, state.otherIncome + annualTaxable);
    $('tmi').value = String(state.tmi);
  }

  /* ---------- Rendu : résultats ---------- */
  function feeLabel(p, usd) {
    const parts = [];
    if (p.pct) parts.push(pct(p.pct));
    if (p.fixed) parts.push(p.fixedCurrency === 'USD' ? `${p.fixed.toLocaleString('fr-FR')} $ (≈ ${eur(C.toEur(p.fixed, 'USD', usd))})` : eur(p.fixed));
    return parts.length ? parts.join(' + ') : 'aucun';
  }

  function renderChart(results) {
    const el = $('chart');
    if (state.edition !== 'full' || results.length < 2) { el.innerHTML = ''; return; }
    const monthly = state.nSales > 1;
    el.innerHTML = `<p class="chart-title">La part du prix que tu gardes${monthly ? ' (sur le mois)' : ''}</p>` + results.map((res, i) => {
      const ratio = Math.max(0, Math.min(1, monthly ? res.month.ratio : res.perSale.ratio));
      return `<div class="bar-row"><span class="bar-label">${esc(res.platformName.replace(/ \(.*\)$/, ''))}</span>
        <span class="bar-track"><span class="bar${i === 0 ? ' best' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></span></span>
        <span class="bar-value">${(ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %</span></div>`;
    }).join('');
  }

  function renderResults() {
    const r = rates();
    const results = computeAll();
    const full = state.edition === 'full';
    const monthly = full && state.nSales > 1;
    renderChart(results);
    if (!results.length) { $('results').innerHTML = '<p class="hint">Choisis au moins une plateforme.</p>'; $('resultsHint').innerHTML = ''; return; }

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
      if (s.price > 0 && s.net <= 0) warn.push('Prix trop bas pour cette plateforme : les frais dépassent ce que tu toucherais.');
      if (!p.verified) warn.push('Taux non vérifiés dans l\'étude.');
      if (p.estimated) warn.push('Estimation pour : ' + p.estimated.join(', ') + '.');
      const vat = p.vatByPlatform && s.price > 0 ? ` Un client en France paiera ≈ ${eur(s.price * (1 + DEFAULTS.vatRate / 100))} TTC (TVA ${DEFAULTS.vatRate} % ajoutée par la plateforme, qui la reverse elle-même).` : '';
      return `<details class="result${best ? ' best' : ''}" ${results.length === 1 ? 'open' : ''}>
        <summary>${summary}</summary>
        <div class="r-body">
          <table class="lines"><tbody>${lines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td></tr>`).join('')}</tbody></table>
          ${monthly ? `<table class="lines month"><tbody>${monthLines.map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td></tr>`).join('')}</tbody></table>` : ''}
          ${warn.length ? `<p class="hint warn">${esc(warn.join(' '))}</p>` : ''}
          ${more('À savoir sur ' + p.name, `<p class="hint">${esc(p.note)}</p><p class="hint">Retrait : ${esc(p.withdrawal.label)}.${esc(vat)}</p>`)}
        </div></details>`;
    }).join('');
    const annual = state.price * Math.max(1, state.nSales) * 12;
    $('resultsHint').innerHTML = full
      ? `<p class="hint">À ce rythme (${state.nSales} vente${state.nSales > 1 ? 's' : ''} par mois), tu encaisses ${eur(annual)} par an.</p>` +
        more('Comment l\'impôt est estimé', `<p class="hint">L'impôt et les prélèvements sont calculés sur ces recettes annuelles, avec l'abattement minimum de 305 €, puis ramenés au mois. Sur le mois, les frais fixes de retrait et les abonnements s'ajoutent.</p>`)
      : `<p class="hint">Hors frais fixes de retrait, cotisations et impôt : la <a href="${esc(buyUrl())}" target="_blank" rel="noopener">version complète</a> les ajoute.</p>`;
  }

  /* ---------- Trésorerie ---------- */
  function renderCash() {
    if (state.edition !== 'full') return;
    const r = rates();
    const rows = selectedPlatforms().map((p) => {
      const fp = C.firstPayout(p, currentInput(p.id));
      return { name: p.name, fp: fp, payout: p.payout, minEur: fp.minimumEur };
    }).sort((a, b) => (a.fp.days == null ? 1e9 : a.fp.days) - (b.fp.days == null ? 1e9 : b.fp.days));
    $('cashResults').innerHTML = rows.length ? `<table class="compare cash"><thead><tr><th>Plateforme</th><th>Premier argent sur mon compte</th><th>Minimum à atteindre</th><th>Comment ça se passe</th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr${i === 0 ? ' class="best-row"' : ''}><td>${i === 0 ? '<span class="star">★</span> ' : ''}${esc(x.name)}</td>
        <td><b>${x.fp.reachable ? days(x.fp.days) : 'jamais (net nul)'}</b>${x.fp.monthsToMinimum > 1 ? `<br><small>${x.fp.monthsToMinimum} mois pour atteindre le seuil</small>` : ''}</td>
        <td>${x.minEur > 0 ? eur(x.minEur) : 'aucun'}</td>
        <td class="small">${esc(x.payout ? x.payout.label : '')}</td></tr>`).join('')}</tbody></table>
      ${more('Hypothèses du calcul', `<p class="hint">Ventes régulières réparties sur le mois, délais moyens observés, pas de litige. Un seuil non atteint en un mois repousse le premier versement d'autant : c'est ce qui rend un store à 15 % parfois moins intéressant qu'une plateforme à 20 % qui paie dès le premier euro.</p>`)}` : '';
  }

  /* ---------- Objectif et point mort ---------- */
  function renderGoal() {
    if (state.edition !== 'full') return;
    const rows = selectedPlatforms().map((p) => {
      const inp = currentInput(p.id);
      const need = C.salesNeeded(p, inp, state.targetMonthly, state.fixedCosts);
      const breakEven = state.fixedCosts > 0 ? C.salesNeeded(p, inp, 0, state.fixedCosts) : 0;
      const now = C.compute(p, inp).month.net - state.fixedCosts;
      return { name: p.name, need: need, breakEven: breakEven, now: now };
    }).sort((a, b) => (a.need == null ? 1e12 : a.need) - (b.need == null ? 1e12 : b.need));
    $('goalResults').innerHTML = rows.length ? `<table class="compare"><thead><tr><th>Plateforme</th><th>Ventes par mois pour ${eur(state.targetMonthly)} net</th><th>Ventes pour couvrir mes frais fixes</th><th>Net au rythme actuel (${state.nSales}/mois) − frais</th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr${i === 0 && x.need != null ? ' class="best-row"' : ''}><td>${esc(x.name)}</td>
        <td><b>${x.need == null ? 'impossible à ce prix' : int(x.need) + (x.need > 1 ? ' ventes' : ' vente')}</b>${x.need != null ? `<br><small>soit ${(x.need / 30).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} par jour</small>` : ''}</td>
        <td>${x.breakEven == null ? 'impossible' : (x.breakEven === 0 ? 'aucun frais fixe' : int(x.breakEven))}</td>
        <td class="${x.now < 0 ? 'neg' : ''}">${eur(x.now)}</td></tr>`).join('')}</tbody></table>
      ${more('Comment c\'est calculé', `<p class="hint">Le nombre de ventes tient compte des frais fixes de retrait, des abonnements et de l'impôt annualisé à ce rythme : ce n'est pas une simple division.</p>`)}` : '';
  }

  /* ---------- Quel statut ? ---------- */
  function renderCompareSelect() {
    const sel = $('comparePlatform');
    const plats = selectedPlatforms();
    sel.innerHTML = `<option value="best">la meilleure plateforme</option>` + plats.map((p) => `<option value="${p.id}" ${state.comparePlatform === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    if (!plats.some((p) => p.id === state.comparePlatform)) state.comparePlatform = 'best';
    sel.value = state.comparePlatform;
  }
  function renderCompare() {
    if (state.edition !== 'full') return;
    const r = rates();
    const results = computeAll();
    if (!results.length) { $('compareResults').innerHTML = ''; return; }
    const platformId = state.comparePlatform === 'best' ? results[0].platformId : state.comparePlatform;
    const p = r.platforms.find((x) => x.id === platformId);
    const rows = C.statusMatrix(p, currentInput(p.id), r.statuses).sort((a, b) => b.annualNet - a.annualNet);
    const cur = state.statusId;
    $('compareResults').innerHTML = `<table class="compare"><thead><tr><th>Statut</th><th>Cotisations / an</th><th>Impôt / an</th><th>Net / an</th><th>Net / an en %</th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr class="${i === 0 ? 'best-row' : ''}${x.statusId === cur ? ' current' : ''}"><td>${i === 0 ? '<span class="star">★</span> ' : ''}${esc(x.statusName)}${x.statusId === cur ? ' <small>(ton choix)</small>' : ''}</td>
        <td>${eur(x.annualSocial)}</td><td>${eur(x.annualTax)}</td><td><b>${eur(x.annualNet)}</b></td><td>${x.annualGross > 0 ? (x.annualNet / x.annualGross * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' %' : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Sur ${esc(p.name)}, ${state.nSales} vente${state.nSales > 1 ? 's' : ''} par mois à ${eur(state.price)}${state.acre ? ', ACRE' : ''}${state.vl ? ', versement libératoire' : ''}, TMI ${state.tmi} %.</p>
      ${more('Attention : le statut ne se choisit pas que sur le chiffre', `<p class="hint">Le statut dépend d'abord de la nature de l'activité : un logiciel, un service ou un conseil relèvent du BNC ou du BIC services, jamais de la vente de marchandises. Et « particulier » ne vaut que pour une activité ponctuelle : au-delà, l'immatriculation s'impose, quel que soit le résultat du calcul.</p>`)}`;
  }

  /* ---------- Jalons ---------- */
  function renderMilestones() {
    if (state.edition !== 'full') return;
    const monthlyCA = state.price * Math.max(1, state.nSales);
    const annualCA = monthlyCA * 12;
    const list = C.milestones(DEFAULTS.thresholds, annualCA, monthlyCA, state.statusId, state.nSales);
    $('milestones').innerHTML = list.map((t) => {
      let when;
      if (t.reached === null) when = 'à vérifier avec ton avis d\'imposition';
      else if (t.reached) when = t.whenMonthly ? 'dès maintenant' : (t.monthReached ? `franchi au mois ${t.monthReached}` : 'franchi');
      else when = t.amount > 0 && monthlyCA > 0 ? `pas à ce rythme (il faudrait ${eur(t.amount / 12)} par mois, soit ${int(Math.ceil(t.amount / 12 / Math.max(0.01, state.price)))} ventes)` : 'non concerné';
      return `<li class="${t.reached === true ? 'hit' : (t.reached === false ? 'far' : 'check')}"><details class="jalon"><summary><span class="mark">${t.reached === true ? '✓' : (t.reached === false ? '○' : '?')}</span>
        <div><b>${esc(t.label)}</b>${t.amount > 1 && !t.isRfr ? ` <small>· ${eur(t.amount)} / an</small>` : (t.amount === 1 ? ' <small>· dès le premier euro</small>' : '')}${t.verified ? '' : ' <small class="warn">· n.v.</small>'}<br><span class="when">${esc(when)}</span></div></summary>
        <small>${esc(t.detail)}</small></details></li>`;
    }).join('') + `<li class="hint">Recettes annuelles à ce rythme : ${eur(annualCA)} (prix client, par prudence).${list.some((t) => !t.verified) ? more('Seuils marqués « n.v. »', '<p class="hint">Ces seuils changent souvent et n\'ont pas été vérifiés pour 2026 : vérifie sur impots.gouv.fr et urssaf.fr avant de t\'y fier.</p>') : ''}</li>`;
  }

  /* ---------- Calcul inverse ---------- */
  function renderInverse() {
    if (state.edition !== 'full') return;
    const rows = selectedPlatforms().map((p) => {
      const price = C.inversePrice(p, currentInput(p.id), state.targetNet);
      const check = price == null ? null : C.compute(p, Object.assign({}, currentInput(p.id), { price: price })).perSale.net;
      return { name: p.name, price: price, check: check };
    }).sort((a, b) => (a.price == null ? 1e12 : a.price) - (b.price == null ? 1e12 : b.price));
    $('inverseResults').innerHTML = rows.length ? `<table class="compare"><thead><tr><th>Plateforme</th><th>Prix à afficher</th><th>Net obtenu</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.price == null ? '—' : '<b>' + eur(x.price) + '</b>'}</td><td>${x.check == null ? 'impossible' : eur(x.check)}</td></tr>`).join('')}</tbody></table>` : '';
  }

  /* ---------- Partage : lien et résumé ---------- */
  function snapshot() {
    return { price: state.price, nSales: state.nSales, nWithdraw: state.nWithdraw, targetNet: state.targetNet, targetMonthly: state.targetMonthly, fixedCosts: state.fixedCosts, selected: state.selected, options: state.options, statusId: state.statusId, tmi: state.tmi, acre: state.acre, vl: state.vl, includeTax: state.includeTax, comparePlatform: state.comparePlatform };
  }
  function shareLink() {
    const q = new URLSearchParams();
    q.set('p', String(state.price)); if (state.nSales !== 1) q.set('n', String(state.nSales)); if (state.nWithdraw !== 1) q.set('w', String(state.nWithdraw));
    q.set('pf', state.selected.join(','));
    const opts = []; Object.keys(state.options).forEach((pid) => Object.keys(state.options[pid]).forEach((oid) => { const def = !!((DEFAULTS.platforms.find((p) => p.id === pid).options || []).find((o) => o.id === oid) || {}).default; if (state.options[pid][oid] !== def) opts.push(pid + ':' + oid + ':' + (state.options[pid][oid] ? 1 : 0)); }));
    if (opts.length) q.set('opt', opts.join(','));
    if (state.statusId !== 'particulier') q.set('s', state.statusId); if (state.tmi) q.set('tmi', String(state.tmi));
    if (state.acre) q.set('acre', '1'); if (state.vl) q.set('vl', '1'); if (!state.includeTax) q.set('tax', '0');
    if (state.targetNet !== 10) q.set('t', String(state.targetNet)); if (state.targetMonthly !== 100) q.set('tm', String(state.targetMonthly)); if (state.fixedCosts) q.set('fc', String(state.fixedCosts));
    const base = (LIC.siteUrl && location.protocol === 'file:') ? LIC.siteUrl : location.href.split('#')[0];
    return base + '#' + q.toString();
  }
  function restoreFromHash() {
    if (!location.hash || location.hash.length < 3) return false;
    try {
      const q = new URLSearchParams(location.hash.slice(1));
      if (!q.has('p')) return false;
      const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
      state.price = Math.max(0, num('p', state.price)); state.nSales = Math.max(1, Math.floor(num('n', 1))); state.nWithdraw = Math.max(0, Math.floor(num('w', 1)));
      state.targetNet = Math.max(0, num('t', 10)); state.targetMonthly = Math.max(0, num('tm', 100)); state.fixedCosts = Math.max(0, num('fc', 0));
      const ids = DEFAULTS.platforms.map((p) => p.id);
      if (q.has('pf')) { const pf = q.get('pf').split(',').filter((x) => ids.includes(x)); if (pf.length) state.selected = state.edition === 'full' ? pf : [pf[0]]; }
      if (q.has('opt')) q.get('opt').split(',').forEach((t) => { const [pid, oid, v] = t.split(':'); if (state.options[pid] && oid in state.options[pid]) state.options[pid][oid] = v === '1'; });
      if (q.has('s') && DEFAULTS.statuses.some((s) => s.id === q.get('s'))) state.statusId = q.get('s');
      if (DEFAULTS.tmiChoices.includes(num('tmi', 0))) state.tmi = num('tmi', 0);
      state.acre = q.get('acre') === '1'; state.vl = q.get('vl') === '1'; state.includeTax = q.get('tax') !== '0';
      return true;
    } catch (e) { return false; }
  }
  function summaryText() {
    const results = computeAll();
    const monthly = state.edition === 'full' && state.nSales > 1;
    const lines = [`Reste Net — ce qu'il me reste sur une vente à ${eur(state.price)}${monthly ? ` (${state.nSales} ventes par mois)` : ''}`];
    results.forEach((x, i) => lines.push(`${i === 0 && results.length > 1 ? '★ ' : '• '}${x.platformName} : ${eur(x.perSale.net)} net par vente (${(x.perSale.ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %)${monthly ? ` · ${eur(x.month.net)} sur le mois` : ''}`));
    if (state.edition === 'full') {
      const st = currentStatus(); if (st) lines.push(`Statut : ${st.name}${state.acre ? ' + ACRE' : ''}${state.vl ? ' + versement libératoire' : ''}${state.includeTax && !state.vl ? ` · TMI ${state.tmi} %` : ''}`);
    } else lines.push('Hors cotisations et impôt (version gratuite).');
    lines.push(`Taux vérifiés le ${DEFAULTS.verifiedOn}. Calcul : ${shareLink()}`);
    return lines.join('\n');
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); $('shareMsg').textContent = okMsg; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); $('shareMsg').textContent = okMsg; } catch (e2) { $('shareMsg').textContent = 'Copie impossible : sélectionne le texte à la main.'; }
      ta.remove();
    }
    setTimeout(() => { $('shareMsg').textContent = ''; }, 4000);
  }

  /* ---------- Export, scénarios ---------- */
  function toCSV() {
    const res = computeAll();
    const head = ['Plateforme', 'Prix client', 'Frais plateforme', 'Montant reversé', 'Cotisations par vente', 'Impôt par vente', 'Net par vente', 'Ventes/mois', 'Encaissé/mois', 'Frais retraits/mois', 'Cotisations/mois', 'Impôt/mois', 'Net/mois', 'Premier versement (jours)'];
    const num = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
    const rows = res.map((x) => {
      const p = rates().platforms.find((q) => q.id === x.platformId);
      const fp = C.firstPayout(p, currentInput(p.id));
      return [x.platformName, num(x.perSale.price), num(x.perSale.platformFee), num(x.perSale.received), num(x.perSale.social), num(x.perSale.incomeTax + x.perSale.prelevements), num(x.perSale.net), state.nSales, num(x.month.gross), num(x.month.withdrawalFees), num(x.month.social), num(x.month.incomeTax + x.month.prelevements), num(x.month.net), fp.days == null ? '' : fp.days];
    });
    const line = (arr) => arr.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';');
    return '﻿' + [line(head)].concat(rows.map(line)).join('\r\n');
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function restore(snap) {
    Object.assign(state, snap);
    syncInputs();
    renderPlatformChips(); renderOptions(); renderStatusControls(); renderCompareSelect(); renderAll();
  }
  function syncInputs() {
    $('price').value = state.price; $('nSales').value = state.nSales; $('nWithdraw').value = state.nWithdraw; $('targetNet').value = state.targetNet;
    $('targetMonthly').value = state.targetMonthly; $('fixedCosts').value = state.fixedCosts;
    $('acre').checked = state.acre; $('vl').checked = state.vl; $('includeTax').checked = state.includeTax;
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
    const numField = (label, path, value, step, unit) => `<label class="s-field"><span>${label}</span><span class="input-unit"><input type="number" step="${step}" min="0" name="${path}" data-path="${path}" value="${value}"><em>${unit}</em></span></label>`;
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
    $('buyBtn').hidden = full; $('licenseBtn').hidden = full; $('footerBuyWrap').hidden = full;
    [$('buyBtn'), $('footerBuy'), $('dialogBuy')].forEach((a) => { a.href = buyUrl(); });
    document.querySelectorAll('.full-only').forEach((el) => { el.hidden = !full; });
    document.querySelectorAll('.lockable').forEach((card) => {
      card.classList.toggle('locked', !full);
      card.classList.toggle('compact', !full && card.dataset.lockCompact === '1');
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
  function renderAll() { renderResults(); renderCash(); renderGoal(); renderCompare(); renderMilestones(); renderInverse(); }

  function bind() {
    window.addEventListener('beforeprint', () => document.querySelectorAll('details.more:not([open])').forEach((d) => { d.open = true; d.dataset.printOpened = '1'; }));
    window.addEventListener('afterprint', () => document.querySelectorAll('details.more[data-print-opened]').forEach((d) => { d.open = false; delete d.dataset.printOpened; }));
    const num = (id, key, min, after) => $(id).addEventListener('input', () => { const v = Number($(id).value); state[key] = Number.isFinite(v) ? Math.max(min, v) : min; if (after) after(); renderAll(); });
    num('price', 'price', 0, autoTmi); num('nSales', 'nSales', 1, autoTmi); num('nWithdraw', 'nWithdraw', 0); num('targetNet', 'targetNet', 0);
    num('targetMonthly', 'targetMonthly', 0); num('fixedCosts', 'fixedCosts', 0); num('otherIncome', 'otherIncome', 0, autoTmi);
    $('status').addEventListener('change', () => { state.statusId = $('status').value; renderStatusControls(); autoTmi(); renderAll(); });
    $('tmi').addEventListener('change', () => { state.tmi = Number($('tmi').value); state.otherIncome = 0; $('otherIncome').value = ''; renderAll(); });
    ['acre', 'vl', 'includeTax'].forEach((id) => $(id).addEventListener('change', () => { state[id] = $(id).checked; renderAll(); }));
    $('comparePlatform').addEventListener('change', () => { state.comparePlatform = $('comparePlatform').value; renderCompare(); });
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
    $('copyLinkBtn').addEventListener('click', () => copy(shareLink(), 'Lien copié : il rouvre exactement ce calcul.'));
    $('copyTextBtn').addEventListener('click', () => copy(summaryText(), 'Résumé copié, prêt à coller dans un forum ou un message.'));
    if (navigator.share) {
      $('shareBtn').hidden = false;
      $('shareBtn').addEventListener('click', async () => { try { await navigator.share({ title: 'Reste Net', text: summaryText(), url: shareLink() }); } catch (e) { /* annulé */ } });
    }
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
    restoreFromHash();
    syncInputs();
    renderPlatformChips(); renderOptions(); renderStatusControls(); renderCompareSelect(); renderSettings(); renderScenarios();
    bind(); applyEdition(); renderAll();
    if (!window.RESTE_NET_SINGLE_FILE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
