# Reste Net — Combien il me reste vraiment ?

Calculateur de net pour les vendeurs et micro-entrepreneurs français. On part du prix payé par le client et on déroule la cascade jusqu'au compte en banque : frais de la plateforme (Gumroad, Polar.sh, Stripe, ComeUp, Fiverr, itch.io, Microsoft Store, Google Play, Steam, Apple, vente directe), frais de retrait, cotisations URSSAF 2026 selon le statut, impôt sur le revenu.

**Version gratuite** : https://bartholoneo.github.io/reste-net/ (une plateforme à la fois, installable, hors ligne).
**Version complète** (3 €, fichier hors ligne + clé pour la version web) : comparateur multi-plateformes avec graphique, statuts et cotisations, **qui te paie en premier** (seuils, délais, premier versement), **objectif et point mort**, **quel statut rapporte le plus**, **jalons réglementaires à ton rythme**, calcul inverse, simulation mensuelle, export CSV, scénarios. Disponible sur Gumroad et Polar, et sur le Microsoft Store.

Les deux éditions : lien de partage qui rouvre le calcul, résumé à copier, aide au choix de la tranche d'impôt, prix TTC client pour les plateformes vendeur officiel.

Aucune donnée ne quitte l'appareil. Les taux de plateformes ont été vérifiés le 24/09/2026 et sont tous modifiables dans l'outil. Outil indicatif : ni conseil fiscal ni conseil comptable.

## Structure

| Dossier / fichier | Rôle |
|---|---|
| `app/` | Source : HTML, CSS, JS vanilla, PWA. `rates.js` contient les taux, `calc.js` le moteur de calcul, `app.js` l'interface |
| `docs/` | Site construit, servi par GitHub Pages (`store.html` est le point d'entrée pour le Microsoft Store) |
| `tests/test_calc.js` | Tests du moteur : `node tests/test_calc.js app` |
| `build.py` | Construit `docs/` et le fichier complet dans `dist/complet/` (non versionné) |
| `make_visuals.py` | Icônes, visuels et captures |

## Développer

```
python build.py
node tests/test_calc.js app
python make_visuals.py shots
```

Un taux a changé ? Modifie `app/rates.js`, incrémente `version`, relance `build.py`, commite `docs/`.

## Licence

Code source visible pour vérifier les calculs. Tous droits réservés, © 2026 Bartholoneo. Contact : bartholoneo@gmail.com

Polices : [Caveat](https://fonts.google.com/specimen/Caveat) et [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand), licence SIL Open Font License 1.1 (textes dans `app/fonts/`).
