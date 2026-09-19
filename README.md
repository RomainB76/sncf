# Suivi des anomalies

Application Vue 3 qui remplace le classeur `Suivi_Anomalies_Industrielles.xlsx`.

| Avant | Maintenant |
|---|---|
| Export clé → copier/coller dans « Données Globales » → les formules recalculent les KPI | L'application appelle l'API clé, lit le classeur reçu et calcule elle-même tous les indicateurs |

Chaque feuille du classeur (hors « Données Globales », qui sert de jeu de données) a sa page :
**Tableau de bord**, puis une page par équipe (AFFAIRES, CHAUDRO, DEMONTAGE, ESSAIS, MONTAGE 1, MONTAGE 2,
MONTAGE 3, NUIT, PEINTURE, PIECES DEPOSEES).

## Démarrer

Prérequis : Node.js 22 ou plus (installé ici : 24 LTS).

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173. Par défaut, l'application interroge une **API clé simulée** fournie par le
serveur de développement : tout fonctionne avant même d'avoir branché la vraie API (voir plus bas).

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (API simulée + relais anti-CORS inclus) |
| `npm test` | Tests, dont la conformité cellule par cellule avec le classeur Excel |
| `npm run type-check` | Vérification TypeScript stricte |
| `npm run build` | Vérification de types puis build de production dans `dist/` |
| `npm run preview` | Sert le build de production (API simulée et relais inclus) |
| `npm run mock:import -- "<classeur.xlsx>"` | Régénère le jeu de données de l'API simulée |

## Brancher la vraie API clé

Tout se règle dans **`public/config.json`**. Le fichier est lu à l'exécution et **relu à chaque clic sur
« Actualiser »** : ni build, ni redémarrage.

```json
{
  "api": {
    "url": "https://<hôte-clé>/<chemin-de-l-export>",
    "jwtToken": "<votre token JWT>",
    "viaProxy": false,
    "timeoutMs": 30000
  }
}
```

| Clé | Rôle |
|---|---|
| `api.url` | URL du `GET` qui renvoie le classeur Excel |
| `api.jwtToken` | Token JWT, envoyé dans l'en-tête `Authorization: Bearer <token>` |
| `api.viaProxy` | `true` = l'appel passe par le relais du serveur Vite (voir CORS ci-dessous) |
| `api.timeoutMs` | Délai maximal de l'appel |
| `donnees.feuille` | Feuille à lire dans le classeur reçu ; à défaut, la première |
| `donnees.joursOuvres` | `auto`, `fichier` ou `calcul` (voir « Jours ouvrés ») |
| `donnees.exclureJoursFeries` | Retire les jours fériés français du calcul des jours ouvrés |
| `equipes`, `machines` | Listes du classeur d'origine, dans l'ordre d'affichage |
| `rafraichissementAutoMinutes` | Actualisation automatique (0 = désactivée), pratique sur un écran d'atelier |

Le service d'appel est [src/services/apiCle.ts](src/services/apiCle.ts). Il distingue et explique chaque échec :
configuration incomplète, token refusé (avec la date d'expiration lue dans le JWT), erreur HTTP, clé injoignable,
délai dépassé, réponse qui n'est pas un classeur (page de connexion HTML, JSON…).

### Si l'appel est bloqué par le navigateur (CORS)

Un appel direct du navigateur vers clé n'aboutit que si clé autorise l'origine de l'application. Sinon le navigateur
bloque la réponse et l'application affiche « clé est injoignable ». Passez alors **`"viaProxy": true`** :
l'appel transite par `/proxy-cle`, exécuté côté serveur Node (dev et preview), donc non soumis au CORS.
`api.url` doit dans ce cas être une URL absolue.

En production sur un serveur statique, deux options : faire autoriser l'origine côté clé, ou reproduire le relais sur
le serveur web frontal (nginx, IIS…) en exposant `/proxy-cle` vers l'URL de clé.

> **Sécurité.** `config.json` est servi au navigateur : toute personne ayant accès à l'application peut lire le token.
> C'est acceptable pour tester. Pour un déploiement partagé, préférez un relais côté serveur qui ajoute lui-même le
> token, ou une authentification par utilisateur. Ne versionnez jamais un vrai token.

### Secours : importer un fichier

Le bouton **Importer un fichier** charge un export clé (ou le classeur complet) depuis le poste : même lecture, mêmes
indicateurs. Utile quand clé est indisponible.

## Correspondance Excel → application

Les formules sont transcrites à l'identique dans [src/domain/](src/domain/), chacune citée dans le code.

| Excel | Formule | Application |
|---|---|---|
| Priorité (col. M) | `=SI(K>4;"Bloquante";SI(K>=3;"Majeure";SI(K>=1;"Mineure";"")))` | `prioriteDepuisJours` |
| Total Anomalies | `=NBVAL('Données Globales'!A:A)-1` | `indicateursGlobaux` |
| Bloquantes / Majeures / Mineures | `=NB.SI('Données Globales'!M:M;"…")` | `indicateursGlobaux` |
| ALERTE >4 jours | `=NB.SI('Données Globales'!K:K;">4")` | `indicateursGlobaux` |
| Synthèse par Équipe | `=NB.SI.ENS(E:E;équipe;M:M;priorité)`, Total, Total Général | `syntheseParEquipe` |
| Feuilles équipe | `=NB.SI.ENS(E:E;équipe;F:F;rame;M:M;priorité)`, Total | `analyseEquipe` |

**Preuve de conformité.** `tests/conformite-excel.test.ts` lit la feuille « Données Globales » du classeur de
référence avec la chaîne de l'application, recalcule tout, et compare **chaque cellule calculée** du Tableau de Bord
et des dix feuilles équipe aux valeurs d'Excel. Pour rejouer la preuve sur une version plus récente du classeur,
remplacez `tests/fixtures/classeur-reference.xlsx` et lancez `npm test`.

### Ce qui est plus robuste que dans Excel

- **Noms d'équipe.** L'export contient « MONTAGE 1␣␣ » (deux espaces finaux), « Peinture », « Chaudro »… et chaque
  formule avait dû être ajustée à la main. L'application compare des clés normalisées (casse, accents, espaces).
- **Équipes et rames nouvelles.** Excel ignorait en silence une équipe ou une rame absente de ses listes. Ici elles
  apparaissent d'office (page, ligne de tableau, entrée de menu), après celles de `config.json`.
- **Colonnes repérées par leur nom d'en-tête**, pas par leur position : l'ordre peut changer.

### Jours ouvrés (`donnees.joursOuvres`)

La priorité dépend de la colonne « Jours Ouvrés Écoulés ». Dans le classeur c'est une valeur, pas une formule.

- `auto` (défaut) : la valeur du fichier si elle existe, sinon calcul depuis « Date de création » ;
- `fichier` : uniquement la valeur du fichier ;
- `calcul` : toujours recalculée — `NB.JOURS.OUVRES(création; aujourd'hui) - 1`, hors week-ends et jours fériés français.

### Lignes fragmentées

Dans le classeur actuel, 4 lignes (133 à 136) sont des fragments : des descriptions ou commentaires sur plusieurs
lignes ont été coupés lors du copier/coller. Excel les compte comme des anomalies (d'où 135 au total mais 131 dans le
« Total Général »). L'application reproduit ces chiffres à l'identique et **signale l'écart** sous le tableau de
synthèse, en listant les lignes concernées. Un vrai fichier `.xlsx` reçu par l'API garde ces textes dans une seule
cellule : le problème disparaît de lui-même.

## Graphiques

Les histogrammes horizontaux du classeur sont conservés, avec deux lectures : **empilé** (par défaut : volume par équipe
et part de chaque criticité, total en bout de barre) et **groupé** (la vue d'origine d'Excel, avec les valeurs).
S'y ajoutent le tri par volume, la légende cliquable, l'infobulle détaillée, le clic pour ouvrir une équipe ou
filtrer une machine, et les thèmes clair/sombre. Chaque graphique est doublé de son tableau : aucun chiffre n'est
réservé au survol.

Les couleurs gardent la logique vert / ambre / rouge du classeur, mais pas ses teintes : le vert et le rouge d'Excel
sont indiscernables pour un daltonien. Le trio retenu a été validé par calcul (contraste, daltonisme) dans les deux
thèmes ; le bouton **Motifs** ajoute des hachures pour l'impression ou un daltonisme sévère. Ne modifiez pas ces
couleurs à l'œil ([src/theme/palette.ts](src/theme/palette.ts), [src/styles/tokens.css](src/styles/tokens.css)).

## Organisation du code

```
public/config.json        Configuration lue à l'exécution (URL, token JWT, listes)
dev-server/serveurCle.ts  Plugin Vite : API clé simulée + relais anti-CORS
src/config/               Chargement et validation de config.json
src/services/apiCle.ts    GET authentifié par JWT → classeur
src/services/lectureExcel.ts  Classeur → anomalies (SheetJS, chargé à la demande)
src/domain/               Règles métier pures : priorité, jours ouvrés, indicateurs
src/stores/anomalies.ts   État central (Pinia) ; les indicateurs sont des valeurs dérivées
src/views/                Tableau de bord, page équipe (un composant pour toutes les équipes)
src/components/           Graphique, tableaux, tuiles, mise en page
tests/                    Conformité Excel + tests unitaires
```

## Données personnelles

`mock/export-cle.xlsx` et `tests/fixtures/classeur-reference.xlsx` contiennent des données réelles (noms d'agents).
Ils sont exclus par `.gitignore` : ne les versionnez pas.

## Dépendances notables

- **SheetJS** est installé depuis son dépôt officiel (`cdn.sheetjs.com`) : la version du registre npm (0.18.5) n'est
  plus maintenue et comporte des vulnérabilités connues.
- **TypeScript est épinglé en 6.0.x** : `vue-tsc` ne prend pas encore en charge TypeScript 7 (portage natif).
