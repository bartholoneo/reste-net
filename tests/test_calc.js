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
check('ComeUp 5 € retrait carte (mois)', C.compute(P('comeup'), { ...base, price: 5, options: { card: true } }).month.net, 3.80);
check('ComeUp 5 € retrait IBAN (mois)', C.compute(P('comeup'), { ...base, price: 5 }).month.net, 3.30);
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
console.log(fails ? fails + ' échec(s)' : 'Tous les tests passent');
process.exit(fails ? 1 : 0);
