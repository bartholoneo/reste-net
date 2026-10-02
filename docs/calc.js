/* Reste Net — moteur de calcul pur (sans DOM). Utilisable dans le navigateur et sous Node pour les tests. */
(function (root) {
  'use strict';

  function toEur(amount, currency, usdToEur) {
    if (!amount) return 0;
    return currency === 'USD' ? amount * usdToEur : amount;
  }

  function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

  /* Résout les options cochées d'une plateforme en taux effectifs. */
  function effectivePlatform(platform, enabledOptions) {
    const p = {
      pct: platform.pct, fixed: platform.fixed, fixedCurrency: platform.fixedCurrency,
      wFixed: platform.withdrawal.fixed, wFixedCurrency: platform.withdrawal.fixedCurrency,
      wPct: platform.withdrawal.pct || 0,
      wMonthly: platform.withdrawal.monthly || 0, wMonthlyCurrency: platform.withdrawal.monthlyCurrency || 'USD',
      monthlySub: 0, monthlySubCurrency: 'USD',
      caBasis: platform.caBasis,
    };
    (platform.options || []).forEach(function (o) {
      if (!enabledOptions || !enabledOptions[o.id]) return;
      if (o.pctOverride != null) p.pct = o.pctOverride;
      if (o.fixedOverride != null) p.fixed = o.fixedOverride;
      if (o.withdrawalFixedOverride != null) p.wFixed = o.withdrawalFixedOverride;
      if (o.monthlySub != null) { p.monthlySub = o.monthlySub; p.monthlySubCurrency = o.monthlySubCurrency || 'USD'; }
    });
    return p;
  }

  /* Frais de plateforme sur une vente. */
  function platformFee(p, price, usdToEur) {
    return price * p.pct / 100 + toEur(p.fixed, p.fixedCurrency, usdToEur);
  }

  /* Prélèvements (cotisations + impôt) sur une base annuelle de CA.
     Retourne { social, incomeTax, prelevements, taxable }. annualize=true applique le minimum d'abattement. */
  function levies(status, caBase, taxOpts, applyMinimum) {
    const t = taxOpts || {};
    const socialRate = (t.acre ? status.socialAcre : status.social) + (status.cfp || 0) + (status.tfc || 0);
    const social = caBase * socialRate / 100;
    let incomeTax = 0, prelevements = 0, taxable = 0;
    if (t.includeTax !== false) {
      if (t.versementLiberatoire && status.versementLiberatoire != null) {
        incomeTax = caBase * status.versementLiberatoire / 100;
      } else {
        const abat = applyMinimum ? Math.max(status.abattementMin || 0, caBase * status.abattement / 100) : caBase * status.abattement / 100;
        taxable = Math.max(0, caBase - abat);
        incomeTax = taxable * (t.tmi || 0) / 100;
        prelevements = taxable * (status.prelevementsSociaux || 0) / 100;
      }
    }
    return { social: social, incomeTax: incomeTax, prelevements: prelevements, taxable: taxable, socialRate: socialRate };
  }

  /* Calcul complet pour une plateforme.
     input = { price, nSales, nWithdrawals, usdToEur, options, status (objet ou null), tax: {acre, versementLiberatoire, tmi, includeTax}, forceGrossBasis }
     Retour : par vente (marginal, sans minimum d'abattement) et sur le mois (annualisé ×12 pour l'abattement minimum). */
  function compute(platform, input) {
    const usd = input.usdToEur;
    const p = effectivePlatform(platform, input.options);
    const price = Math.max(0, Number(input.price) || 0);
    const n = Math.max(0, Math.floor(Number(input.nSales) || 0));
    const w = Math.max(0, Math.floor(Number(input.nWithdrawals) || 0));

    // Par vente
    const fee1 = platformFee(p, price, usd);
    const received1 = price - fee1;
    const wVar1 = received1 > 0 ? received1 * p.wPct / 100 : 0;

    // Sur le mois
    const gross = price * n;
    const fees = fee1 * n;
    const received = gross - fees;
    const wFixedTotal = w * toEur(p.wFixed, p.wFixedCurrency, usd) + (w > 0 ? toEur(p.wMonthly, p.wMonthlyCurrency, usd) : 0);
    const wVar = received > 0 ? received * p.wPct / 100 : 0;
    const subs = toEur(p.monthlySub, p.monthlySubCurrency, usd);
    const withdrawalFees = wFixedTotal + wVar + subs;
    const bank = received - withdrawalFees;

    const basis = (input.forceGrossBasis ? 'gross' : p.caBasis);
    const result = {
      platformId: platform.id, platformName: platform.name, basis: basis,
      perSale: { price: price, platformFee: fee1, received: received1, withdrawalVar: wVar1, social: 0, incomeTax: 0, prelevements: 0, net: received1 - wVar1 },
      month: { gross: gross, platformFees: fees, received: received, withdrawalFees: withdrawalFees, bank: bank, social: 0, incomeTax: 0, prelevements: 0, net: bank, caBase: basis === 'gross' ? gross : received },
      effective: p,
    };

    if (input.status) {
      // Impôt et prélèvements : estimés à ce rythme de ventes sur douze mois, pour appliquer l'abattement minimum (305 €).
      const salesPerYear = Math.max(1, n) * 12;
      const base1 = basis === 'gross' ? price : received1;
      const l1 = levies(input.status, Math.max(0, base1) * salesPerYear, input.tax, true);
      result.perSale.social = l1.social / salesPerYear; result.perSale.incomeTax = l1.incomeTax / salesPerYear; result.perSale.prelevements = l1.prelevements / salesPerYear;
      result.perSale.net = received1 - wVar1 - result.perSale.social - result.perSale.incomeTax - result.perSale.prelevements;

      const annualBase = Math.max(0, result.month.caBase) * 12;
      const lA = levies(input.status, annualBase, input.tax, true);
      result.month.social = lA.social / 12; result.month.incomeTax = lA.incomeTax / 12; result.month.prelevements = lA.prelevements / 12;
      result.month.net = bank - result.month.social - result.month.incomeTax - result.month.prelevements;
      result.socialRate = l1.socialRate;
    }
    result.perSale.ratio = price > 0 ? result.perSale.net / price : 0;
    result.month.ratio = gross > 0 ? result.month.net / gross : 0;
    return result;
  }

  /* Calcul inverse : prix à afficher pour toucher targetNet par vente. Bissection (net croissant avec le prix). */
  function inversePrice(platform, input, targetNet) {
    let lo = 0, hi = 10;
    const f = function (price) { return compute(platform, Object.assign({}, input, { price: price })).perSale.net; };
    if (f(1e7) < targetNet) return null;
    while (f(hi) < targetNet && hi < 1e7) hi *= 2;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < targetNet) lo = mid; else hi = mid;
    }
    return Math.ceil(hi * 100) / 100;
  }

  const api = { toEur: toEur, round2: round2, effectivePlatform: effectivePlatform, platformFee: platformFee, levies: levies, compute: compute, inversePrice: inversePrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ResteNetCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
