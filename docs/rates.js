/* Reste Net — données de taux. Tout est modifiable dans l'interface.
   Dates de vérification : étude du 24/09/2026 sauf mention « estimation » ou « n.v. » (non vérifié).
   fixedCurrency : devise du frais fixe par vente ('EUR' | 'USD').
   caBasis : base de chiffre d'affaires déclaré à l'URSSAF (lecture dominante, à confirmer) :
     'gross'  = prix payé par le client (plateforme intermédiaire, tu es le vendeur) ;
     'payout' = montant reversé (la plateforme est vendeur officiel / Merchant of Record).
   vatByPlatform : la plateforme ajoute la TVA du pays du client au prix que tu fixes (vendeur officiel).
   payout : comment et quand l'argent arrive (minimum à atteindre, délai moyen en jours une fois le minimum atteint, rythme).
   minPrice : prix minimum accepté par la plateforme pour une vente (avertissement dans l'interface). */

window.RESTE_NET_RATES = {
  version: '1.1.2',
  verifiedOn: '24/09/2026',
  usdToEur: 0.90,

  platforms: [
    {
      id: 'gumroad', name: 'Gumroad', group: 'Produits numériques',
      pct: 10, fixed: 0.50, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, minimum: 10, minimumCurrency: 'USD', label: 'Virement direct gratuit (seuil 10 $ après vérification d\'identité)' },
      payout: { minimum: 10, minimumCurrency: 'USD', delayDays: 7, schedule: 'weekly', label: 'Virement chaque vendredi dès 10 $ de solde, 2 à 7 jours ouvrés' },
      options: [{ id: 'discover', label: 'Vente via Gumroad Discover (30 %)', pctOverride: 30 }],
      note: 'Gumroad est vendeur officiel (MoR) : il ajoute la TVA au prix et te reverse le montant hors frais.',
      verified: true,
    },
    {
      id: 'polar', name: 'Polar.sh', group: 'Produits numériques',
      pct: 5, fixed: 0.50, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0.25, fixedCurrency: 'USD', pct: 0.25, monthly: 2, monthlyCurrency: 'USD', label: 'Stripe Connect Express : 0,25 % + 0,25 $ par payout, ~2 $/mois par payout actif' },
      payout: { minimum: 10, minimumCurrency: 'USD', delayDays: 7, schedule: 'ondemand', label: 'Payout Stripe à la demande (minimum ≈ 10 $, n.v.), 2 à 7 jours' },
      options: [{ id: 'pro', label: 'Plan Pro (3,8 % + 0,40 $, 20 $/mois)', pctOverride: 3.8, fixedOverride: 0.40, monthlySub: 20, monthlySubCurrency: 'USD' }],
      note: 'Merchant of Record : TVA gérée par Polar. Particulier accepté en France.',
      verified: true,
    },
    {
      id: 'stripe', name: 'Stripe France (compte classique)', group: 'Vente directe',
      pct: 1.5, fixed: 0.25, fixedCurrency: 'EUR',
      caBasis: 'gross', vatByPlatform: false,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, label: 'Virement gratuit' },
      payout: { minimum: 0, minimumCurrency: 'EUR', delayDays: 7, schedule: 'rolling', label: 'Virement automatique 7 jours après chaque paiement' },
      options: [],
      note: 'Cartes européennes. SIRET obligatoire : réservé aux micro-entrepreneurs immatriculés.',
      verified: true,
    },
    {
      id: 'comeup', name: 'ComeUp', group: 'Services freelance',
      pct: 20, fixed: 0, fixedCurrency: 'EUR',
      caBasis: 'gross', vatByPlatform: false,
      minPrice: { amount: 15, currency: 'EUR' },
      withdrawal: { fixed: 0.50, fixedCurrency: 'EUR', pct: 0, minimum: 1, minimumCurrency: 'EUR', label: 'Hyperwallet : 0,50 € vers IBAN, 0 € vers carte bancaire, dès 1 €' },
      payout: { minimum: 1, minimumCurrency: 'EUR', delayDays: 9, schedule: 'ondemand', label: 'Crédit après validation de la commande (jusqu\'à 8 jours), retrait dès 1 €, validé en 3 à 5 jours ouvrés' },
      options: [
        { id: 'card', label: 'Retrait vers carte bancaire (gratuit)', withdrawalFixedOverride: 0, default: true },
        { id: 'plus', label: 'ComeUp Plus (1 € HT par commande, 13 € HT par mois)', pctOverride: 0, fixedOverride: 1.20, monthlySub: 15.60, monthlySubCurrency: 'EUR' },
      ],
      note: 'Commission 20 % du prix sans abonnement ; 1 € HT par commande avec ComeUp Plus (13 € HT par mois, soit 15,60 € TTC). Prix minimum d\'un service : 15 €. L\'acheteur paie en plus des frais de paiement. Conditions vérifiées le 04/10/2026.',
      verified: true,
    },
    {
      id: 'fiverr', name: 'Fiverr', group: 'Services freelance',
      pct: 20, fixed: 0, fixedCurrency: 'USD',
      caBasis: 'gross', vatByPlatform: false,
      minPrice: { amount: 5, currency: 'USD' },
      withdrawal: { fixed: 3, fixedCurrency: 'USD', pct: 2, label: 'Payoneer : 3 $ par retrait + change ≈ 2 % (estimation)' },
      payout: { minimum: 0, minimumCurrency: 'USD', delayDays: 17, schedule: 'ondemand', label: 'Argent bloqué 14 jours après chaque commande, puis retrait Payoneer 1 à 3 jours' },
      options: [],
      note: 'Argent bloqué 14 jours après chaque commande. Frais de change estimés, non vérifiés.',
      verified: true, estimated: ['change'],
    },
    {
      id: 'itch', name: 'itch.io (collecté par itch.io)', group: 'Jeux et outils',
      pct: 13, fixed: 0.30, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 1.50, fixedCurrency: 'USD', pct: 2, minimum: 5, minimumCurrency: 'USD', label: 'Payoneer : minimum 5 $, 1,50 $ par retrait + change ≈ 2 % (estimation)' },
      payout: { minimum: 5, minimumCurrency: 'USD', delayDays: 14, schedule: 'ondemand', label: 'Demande de paiement dès 5 $, revue 7 jours minimum, 10 à 14 jours en général, puis Payoneer' },
      options: [],
      note: 'Part itch.io 10 % par défaut (réglable sur ta page) + traitement du paiement ≈ 3 % + 0,30 $ (estimation).',
      verified: true, estimated: ['traitement du paiement', 'change'],
    },
    {
      id: 'msstore', name: 'Microsoft Store', group: 'Stores',
      pct: 15, fixed: 0, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, minimum: 50, minimumCurrency: 'USD', label: 'SEPA gratuit, seuil 50 $' },
      payout: { minimum: 50, minimumCurrency: 'USD', delayDays: 20, schedule: 'monthly', label: 'Versement mensuel dès 50 $ de solde, SEPA 2 à 3 jours ouvrés' },
      options: [{ id: 'game', label: 'Jeu (12 %)', pctOverride: 12 }],
      note: 'Compte développeur individuel gratuit depuis septembre 2025.',
      verified: true,
    },
    {
      id: 'gplay', name: 'Google Play', group: 'Stores',
      pct: 15, fixed: 0, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, minimum: 1, minimumCurrency: 'USD', label: 'Virement en euros gratuit, seuil 1 $, vers le 15 du mois suivant' },
      payout: { minimum: 1, minimumCurrency: 'USD', delayDays: 30, schedule: 'monthly', label: 'Virement vers le 15 du mois suivant dès 1 $' },
      options: [{ id: 'eea', label: 'Barème EEE nouvelles installations (10 %, n.v.)', pctOverride: 10 }],
      note: 'Compte développeur 25 $ une fois. Google est vendeur officiel dans l\'UE.',
      verified: true,
    },
    {
      id: 'steam', name: 'Steam', group: 'Stores',
      pct: 30, fixed: 0, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, minimum: 100, minimumCurrency: 'USD', label: 'Virement, seuil 100 $' },
      payout: { minimum: 100, minimumCurrency: 'USD', delayDays: 45, schedule: 'monthly', label: 'Versement mensuel, environ 30 jours après la fin du mois, dès 100 $ (n.v.)' },
      options: [],
      note: '100 $ par jeu à l\'inscription (remboursés après 1 000 $ de ventes). Non vérifié dans l\'étude.',
      verified: false,
    },
    {
      id: 'apple', name: 'Apple App Store', group: 'Stores',
      pct: 15, fixed: 0, fixedCurrency: 'USD',
      caBasis: 'payout', vatByPlatform: true,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, minimum: 10, minimumCurrency: 'USD', label: 'Virement, seuil 10 $' },
      payout: { minimum: 10, minimumCurrency: 'USD', delayDays: 45, schedule: 'monthly', label: 'Versement mensuel, environ 45 jours après la fin du mois (n.v.)' },
      options: [{ id: 'std', label: 'Barème standard (30 %)', pctOverride: 30 }],
      note: '99 $ par an. 15 % avec le Small Business Program. Non vérifié dans l\'étude.',
      verified: false,
    },
    {
      id: 'direct', name: 'Entre particuliers (virement, Wero, Lydia)', group: 'Vente directe',
      pct: 0, fixed: 0, fixedCurrency: 'EUR',
      caBasis: 'gross', vatByPlatform: false,
      withdrawal: { fixed: 0, fixedCurrency: 'EUR', pct: 0, label: 'Aucun frais' },
      payout: { minimum: 0, minimumCurrency: 'EUR', delayDays: 0, schedule: 'instant', label: 'Immédiat' },
      options: [],
      note: '1 € payé = 1 € reçu. Revenu à déclarer quand même.',
      verified: true,
    },
  ],

  statuses: [
    {
      id: 'particulier', name: 'Particulier occasionnel (non immatriculé)',
      social: 0, socialAcre: 0, cfp: 0, tfc: 0,
      prelevementsSociaux: 17.2, abattement: 34, abattementMin: 305, versementLiberatoire: null,
      note: 'Revenus BNC non professionnels (2042 C PRO). Abattement de 34 % avec un minimum de 305 € : en dessous de 305 € de recettes dans l\'année, base imposable nulle, mais la déclaration reste due. Une activité habituelle impose l\'immatriculation.',
    },
    {
      id: 'bnc', name: 'Micro-entreprise BNC (libéral : dev, conseil, rédaction, design)',
      social: 26.1, socialAcre: 13.05, cfp: 0.2, tfc: 0,
      prelevementsSociaux: 0, abattement: 34, abattementMin: 305, versementLiberatoire: 2.2,
      note: 'Taux URSSAF au 01/01/2026 (26,1 %). ACRE : moitié la première année.',
    },
    {
      id: 'bic-services', name: 'Micro-entreprise BIC prestations de services (artisan, commerçant)',
      social: 21.2, socialAcre: 10.6, cfp: 0.3, tfc: 0.48,
      prelevementsSociaux: 0, abattement: 50, abattementMin: 305, versementLiberatoire: 1.7,
      note: 'CFP 0,3 % et TFC 0,48 % pour un artisan (commerçant : 0,1 % et 0,044 %).',
    },
    {
      id: 'bic-vente', name: 'Micro-entreprise BIC vente de marchandises',
      social: 12.3, socialAcre: 6.2, cfp: 0.1, tfc: 0.015,
      prelevementsSociaux: 0, abattement: 71, abattementMin: 305, versementLiberatoire: 1.0,
      note: 'TFC 0,015 % pour un commerçant (artisan : 0,22 %).',
    },
  ],

  tmiChoices: [0, 11, 30, 41, 45],
  /* Barème 2026 de l'impôt sur les revenus 2025, par part de quotient familial (n.v. pour les revenus 2026). */
  irBrackets: [
    { upTo: 11497, rate: 0 }, { upTo: 29315, rate: 11 }, { upTo: 83823, rate: 30 }, { upTo: 180294, rate: 41 }, { upTo: null, rate: 45 },
  ],
  vatRate: 20,

  /* Jalons réglementaires, en euros de recettes annuelles (CA encaissé ou reversé selon la base). statuses : statuts concernés (vide = tous). */
  thresholds: [
    { id: 'abattement', amount: 305, label: 'Abattement minimum de 305 €', detail: 'En dessous, la base imposable est nulle (déclaration due quand même). Au-dessus, l\'abattement devient proportionnel (34 %, 50 % ou 71 %).', verified: true },
    { id: 'dac7', amount: 1, label: 'Déclaration DAC7 par la plateforme', detail: 'Les plateformes transmettent tes revenus de services à l\'administration dès le premier euro (biens : au-delà de 30 ventes ou 2 000 € dans l\'année).', verified: true },
    { id: 'habituel', amount: 0, label: 'Activité habituelle = immatriculation', detail: 'Vendre chaque mois est une activité habituelle : l\'administration attend une micro-entreprise (gratuite, en ligne). Le statut « particulier occasionnel » ne tient que pour des ventes ponctuelles.', verified: true, statuses: ['particulier'], whenMonthly: true },
    { id: 'cfe', amount: 5000, label: 'Cotisation foncière des entreprises (CFE)', detail: 'Exonérée la première année civile et tant que le CA annuel ne dépasse pas 5 000 €. Au-delà : CFE due (montant selon la commune, souvent 200 à 500 €).', verified: false, statuses: ['bnc', 'bic-services', 'bic-vente'] },
    { id: 'vl', amount: 28797, label: 'Plafond du versement libératoire', detail: 'Option possible si le revenu fiscal de référence du foyer (N-2) ne dépasse pas ≈ 28 800 € par part (chiffre 2025, n.v. pour 2026).', verified: false, statuses: ['bnc', 'bic-services', 'bic-vente'], isRfr: true },
    { id: 'tva', amount: 37500, label: 'Franchise en base de TVA (services)', detail: 'Pas de TVA à facturer jusqu\'à 37 500 € de CA annuel (seuil majoré 41 250 €). Vente de marchandises : 85 000 €. La réforme à 25 000 € a été suspendue : à vérifier chaque année.', verified: false, statuses: ['bnc', 'bic-services', 'particulier'] },
    { id: 'tva-vente', amount: 85000, label: 'Franchise en base de TVA (vente)', detail: 'Pas de TVA à facturer jusqu\'à 85 000 € de CA annuel (seuil majoré 93 500 €), n.v. 2026.', verified: false, statuses: ['bic-vente'] },
    { id: 'micro', amount: 83600, label: 'Plafond de la micro-entreprise (services)', detail: 'Au-delà de 83 600 € de CA annuel (2026) deux années de suite, sortie du régime micro vers le réel.', verified: true, statuses: ['bnc', 'bic-services', 'particulier'] },
    { id: 'micro-vente', amount: 188700, label: 'Plafond de la micro-entreprise (vente)', detail: 'Chiffre 2025 (≈ 188 700 €), n.v. pour 2026.', verified: false, statuses: ['bic-vente'] },
  ],
};

/* Identifiants de licence : à renseigner après création des produits (voir PUBLICATION.md). */
window.LICENSE_CONFIG = {
  polarOrganizationId: '',
  gumroadProductId: '',
  buyUrlGumroad: 'https://bartholoneo.gumroad.com/l/reste-net',
  buyUrlPolar: 'https://polar.sh/bartholoneo/products/reste-net',
  siteUrl: 'https://bartholoneo.github.io/reste-net/',
};
