global.window = {};
const path = require('path');
const APP = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
require(path.join(APP, 'rates.js'));
const C = require(path.join(APP, 'calc.js'));
const R = global.window.RESTE_NET_RATES;
const P = (id) => R.platforms.find(p => p.id === id);
const S = (id) => R.statuses.find(s => s.id === id);
const base = { nSales: 1, nWithdrawals: 1, usdToEur: 0.90, options: {}, status: null, tax: {} };
const r2 = (x) => Math.round(x * 100) / 100;
let fails = 0;
function check(label, got, want) { const ok = Math.abs(got - want) < 0.006; if (!ok) fails++; console.log((ok ? 'OK ' : 'KO ') + label + ' → ' + r2(got) + ' (attendu ' + want + ')'); }
check('Gumroad 2 €', C.compute(P('gumroad'), { ...base, price: 2 }).perSale.net, 1.35);
check('Gumroad 5 €', C.compute(P('gumroad'), { ...base, price: 5 }).perSale.net, 4.05);
check('Polar 2 €', C.compute(P('polar'), { ...base, price: 2 }).perSale.received, 1.45);
check('Polar 5 €', C.compute(P('polar'), { ...base, price: 5 }).perSale.received, 4.30);
check('Stripe 2 €', C.compute(P('stripe'), { ...base, price: 2 }).perSale.net, 1.72);
check('ComeUp 15 € retrait carte (mois, 20 %)', C.compute(P('comeup'), { ...base, price: 15, options: { card: true } }).month.net, 12.00);
check('ComeUp 15 € retrait IBAN (mois, 20 %)', C.compute(P('comeup'), { ...base, price: 15 }).month.net, 11.50);
check('ComeUp Plus 15 € (par vente, 1 € HT)', C.compute(P('comeup'), { ...base, price: 15, options: { card: true, plus: true } }).perSale.net, 13.80);
check('ComeUp Plus 15 € (mois, 1 vente, abonnement 15,60 €)', C.compute(P('comeup'), { ...base, price: 15, options: { card: true, plus: true } }).month.net, -1.80);
check('BNC 100 € direct (par vente)', C.compute(P('direct'), { ...base, price: 100, status: S('bnc'), tax: { tmi: 0 } }).perSale.net, 73.70);
check('Particulier 100 € direct (mois, annualisé 1200 €)', C.compute(P('direct'), { ...base, price: 100, status: S('particulier'), tax: { tmi: 11 } }).month.net, 100 - ((1200 - Math.max(305, 408)) * (0.11 + 0.172)) / 12);
check('Particulier 20 € direct (mois, < 305 €/an)', C.compute(P('direct'), { ...base, price: 20, status: S('particulier'), tax: { tmi: 30 } }).month.net, 20);
check('BNC VL 100 €', C.compute(P('direct'), { ...base, price: 100, status: S('bnc'), tax: { versementLiberatoire: true } }).perSale.net, 100 - 26.3 - 2.2);
check('BNC ACRE 100 €', C.compute(P('direct'), { ...base, price: 100, status: S('bnc'), tax: { acre: true, tmi: 0 } }).perSale.net, 100 - 13.25);
check('MS Store 2,99 €', C.compute(P('msstore'), { ...base, price: 2.99 }).perSale.net, 2.54);
check('Fiverr 5 € (mois, 1 retrait)', C.compute(P('fiverr'), { ...base, price: 5 }).month.net, 4 - 2.7 - 0.08);
for (const id of ['gumroad', 'polar', 'comeup', 'fiverr', 'itch', 'msstore', 'direct']) {
  const inp = { ...base, status: S('bnc'), tax: { tmi: 11 } };
  const price = C.inversePrice(P(id), inp, 10);
  const net = C.compute(P(id), { ...inp, price }).perSale.net;
  check('inverse ' + id + ' (prix ' + price + ')', net, 10);
}

// --- nouvelles fonctions (v1.1) ---
check('salesNeeded direct 5 €, sans statut, 100 € net/mois → 20', C.salesNeeded(P('direct'), { ...base, price: 5 }, 100, 0), 20);
check('salesNeeded direct 5 €, particulier TMI 0, 100 € net/mois → 23 (prélèvements sociaux au-delà de 305 €/an)', C.salesNeeded(P('direct'), { ...base, price: 5, status: S('particulier'), tax: { tmi: 0 } }, 100, 0), 23);
check('salesNeeded point mort : frais fixes 10 €, Gumroad 5 € → 3 ventes', C.salesNeeded(P('gumroad'), { ...base, price: 5 }, 0, 10), 3);
check('salesNeeded impossible si net ≤ 0 (prix 0,30 € Gumroad) → null', C.salesNeeded(P('gumroad'), { ...base, price: 0.3 }, 10, 0) === null ? 1 : 0, 1);
check('firstPayout direct → 0 jour', C.firstPayout(P('direct'), { ...base, price: 5 }).days, 0);
check('firstPayout Gumroad 1 vente/mois à 5 € : 9 € de seuil / 4,05 → 3 mois, +4 j, +7 j = 101', C.firstPayout(P('gumroad'), { ...base, price: 5 }).days, 101);
check('firstPayout MS Store 1 vente/mois : 45 € / 4,25 → 11 mois +15 +20 = 365', C.firstPayout(P('msstore'), { ...base, price: 5 }).days, 365);
check('firstPayout MS Store 20 ventes/mois : 85 €/mois ≥ 45 € → ceil(30×45/85)=16 j +15 +20 = 51', C.firstPayout(P('msstore'), { ...base, price: 5, nSales: 20 }).days, 51);
check('tmiFor 25 000 € → 11 %', C.tmiFor(R.irBrackets, 25000), 11);
check('tmiFor 90 000 € → 41 %', C.tmiFor(R.irBrackets, 90000), 41);
const ms = C.milestones(R.thresholds, 60, 5, 'particulier', 1);
check('milestones particulier 60 €/an : abattement non atteint, habituel atteint', (ms.find(t => t.id === 'abattement').reached === false && ms.find(t => t.id === 'habituel').reached === true) ? 1 : 0, 1);
const ms2 = C.milestones(R.thresholds, 6000, 500, 'bnc', 100);
check('milestones BNC 6 000 €/an : CFE franchie au mois 10', ms2.find(t => t.id === 'cfe').monthReached, 10);
const sm = C.statusMatrix(P('direct'), { ...base, price: 100, nSales: 10, tax: { tmi: 0 } }, R.statuses);
check('statusMatrix direct 1 000 €/mois : BNC net/an = 12 000 − 26,3 % = 8 844', sm.find(x => x.statusId === 'bnc').annualNet, 8844);
check('statusMatrix : particulier net/an = 12 000 − PS 17,2 % × (12 000 − 4 080) = 10 637,76', sm.find(x => x.statusId === 'particulier').annualNet, 10637.76);

console.log(fails ? fails + ' échec(s)' : 'Tous les tests passent');
process.exit(fails ? 1 : 0);
