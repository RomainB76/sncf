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
| `npm run package` | Assemble le dossier à remettre à un poste sans Node (voir « Distribuer l'application ») |

## Brancher la vraie API clé

Tout se règle dans **`public/config.json`**, lu à l'exécution et **relu à chaque clic sur « Actualiser »** : ni build,
ni redémarrage. Mais ce fichier est versionné dans un dépôt public : **n'y écrivez jamais une vraie URL ni un vrai
token** (un `git add -A` suivi d'un push les publierait). Mettez-les dans **`public/config.local.json`**, exclu du dépôt
par `.gitignore` — copiez [public/config.local.example.json](public/config.local.example.json) pour démarrer :

```json
{
  "api": {
    "url": "https://<hôte-clé>/api/sous-entites/<id-sous-entité>/anomalies?page=0&size=1000&statut=EN_COURS",
    "jwtToken": "<votre token JWT>"
  }
}
```

`config.local.json` est lu juste après `config.json` et **ses valeurs l'emportent** : les sections `api` et `data`
sont fusionnées clé par clé (ci-dessus, `viaProxy` et `timeoutMs` restent ceux de `config.json`), les listes `teams`
et `machines` sont remplacées en bloc si le fichier les définit. Il est relu lui aussi à chaque actualisation ; absent,
l'application se comporte exactement comme avant. Le relais `/cle-proxy` du serveur Vite lit la même surcharge :
navigateur et relais visent toujours la même URL.

Avant de pousser : `git status` ne doit jamais lister `public/config.local.json`, et `git diff public/config.json` ne
doit montrer aucun token réel.

| Clé | Rôle |
|---|---|
| `api.url` | URL du `GET` qui renvoie les anomalies (API de liste de clé, voir ci-dessous) |
| `api.jwtToken` | Token JWT, envoyé dans l'en-tête `Authorization: Bearer <token>` |
| `api.viaProxy` | `true` = l'appel passe par le relais du serveur Vite (voir CORS ci-dessous) |
| `api.timeoutMs` | Délai maximal de l'appel |
| `data.sheet` | Feuille à lire dans le classeur reçu ; à défaut, la première |
| `data.businessDays` | `auto`, `file` ou `computed` (voir « Jours ouvrés ») |
| `data.excludePublicHolidays` | Retire les jours fériés français du calcul des jours ouvrés |
| `teams`, `machines` | Listes du classeur d'origine, dans l'ordre d'affichage |
| `autoRefreshMinutes` | Actualisation automatique (0 = désactivée), pratique sur un écran d'atelier |

Le service d'appel est [src/services/cleApi.ts](src/services/cleApi.ts). Il distingue et explique chaque échec :
configuration incomplète, token refusé (avec la date d'expiration lue dans le JWT), erreur HTTP, clé injoignable,
délai dépassé, réponse inattendue (page de connexion HTML, JSON qui n'est pas une liste d'anomalies…).

### Pourquoi l'API de liste, et pas l'export CSV

`api.url` vise l'API qui alimente l'écran « Anomalies » de clé, `/api/sous-entites/<id>/anomalies`. **Pas le
bouton « Exporter en CSV »**, qui semble pourtant plus naturel :

- **L'export fige les données.** Son URL se termine par un horodatage
  (`…/export-anomalies-<id>-<horodatage>.csv`) : clé génère le fichier depuis la recherche affichée dans la session
  du navigateur, puis le sert sous ce nom. Une URL figée dans `config.json` renvoie donc éternellement le même
  fichier, et une URL neuve renvoie 404, faute de session. L'application affichait les chiffres de la veille sans
  le moindre signal.
- **L'API de liste est une simple requête** : sans état, filtrée explicitement (`statut=EN_COURS`), avec le total
  (`count`) et les noms d'équipe (`metadatas.equipes`) dans la même réponse. Ses dates sont en ISO, et le JSON ne
  connaît ni les retours à la ligne qui coupaient les lignes du CSV, ni l'ambiguïté jour/mois de ses dates.

`size` doit couvrir toutes les anomalies d'une page : au-delà, l'application le signale par un bandeau. « Créée par »
y est un code CP, pas un nom — l'API ne fournit que l'identifiant de l'agent.

### Si l'appel est bloqué par le navigateur (CORS)

Un appel direct du navigateur vers clé n'aboutit que si clé autorise l'origine de l'application. Sinon le navigateur
bloque la réponse et l'application affiche « clé est injoignable ». Passez alors **`"viaProxy": true`** (dans
`config.local.json` ou `config.json`) : l'appel transite par `/cle-proxy`, exécuté côté serveur Node (dev et preview),
donc non soumis au CORS. `api.url` doit dans ce cas être une URL absolue.

En production sur un serveur statique, deux options : faire autoriser l'origine côté clé, ou reproduire le relais sur
le serveur web frontal (nginx, IIS…) en exposant `/cle-proxy` vers l'URL de clé.

> **Sécurité.** `config.json` et `config.local.json` sont servis au navigateur : toute personne ayant accès à
> l'application peut lire le token. C'est acceptable pour tester. Pour un déploiement partagé, préférez un relais côté
> serveur qui ajoute lui-même le token, ou une authentification par utilisateur. Ne versionnez jamais un vrai token :
> seul `config.local.json`, ignoré par git, peut en contenir un.

> **Au déploiement.** `npm run build` copie tout `public/` dans `dist/`, **`config.local.json` compris s'il existe**
> (c'est voulu : `npm run preview` fonctionne alors avec la vraie API). Avant de livrer `dist/`, supprimez
> `dist/config.local.json` ou construisez sans ce fichier, sauf si le token doit vraiment partir avec l'application.

### Secours : importer un fichier

Le bouton **Importer un fichier** charge un export clé (ou le classeur complet) depuis le poste : même lecture, mêmes
indicateurs. Utile quand clé est indisponible.

## Distribuer l'application

`npm run package` assemble **`package/SuiviAnomalies/`**, à zipper et à remettre tel quel. Le poste
destinataire n'a besoin ni de Node, ni de droits d'administrateur : `serveur.ps1` s'appuie sur
PowerShell et .NET, livrés avec Windows.

```
SuiviAnomalies/
  Lancer.bat      Double-clic : démarre le serveur local et ouvre le navigateur
  serveur.ps1     Serveur HTTP local + relais « /cle-proxy » (équivalent de dev-server/cleServer.ts)
  LISEZMOI.txt    Mode d'emploi destiné à l'utilisateur final
  site/           Le build de production
```

Le relais est indispensable : clé n'autorise pas l'origine de l'application, un appel direct du
navigateur est bloqué par le CORS (`TypeError: Failed to fetch`). `serveur.ps1` lit `api.url` dans
`site/config.json` puis `site/config.local.json` côté serveur, exactement comme le relais Vite.

**Chaque utilisateur met son propre token** dans `site/config.local.json` ; le paquet n'en contient
aucun. `vite build` recopiant tout `public/` dans `dist/`, **y compris `config.local.json` et son
vrai token**, le script d'assemblage le remplace systématiquement par un modèle vide et refuse de
produire un paquet où subsisterait un JWT. L'URL de clé, elle, est lue dans votre configuration
locale et inscrite dans le paquet : c'est une adresse interne, qu'aucun fichier versionné ne porte.

Si le destinataire travaille sur une autre UO, l'identifiant de sous-entité présent dans `api.url`
doit être remplacé par le sien.

## Correspondance Excel → application

Les formules sont transcrites à l'identique dans [src/domain/](src/domain/), chacune citée dans le code.

| Excel | Formule | Application |
|---|---|---|
| Priorité (col. M) | `=SI(K>4;"Bloquante";SI(K>=3;"Majeure";SI(K>=1;"Mineure";"")))` | `priorityFromDays` |
| Total Anomalies | `=NBVAL('Données Globales'!A:A)-1` | `globalIndicators` |
| Bloquantes / Majeures / Mineures | `=NB.SI('Données Globales'!M:M;"…")` | `globalIndicators` |
| ALERTE >4 jours | `=NB.SI('Données Globales'!K:K;">4")` | `globalIndicators` |
| Synthèse par Équipe | `=NB.SI.ENS(E:E;équipe;M:M;priorité)`, Total, Total Général | `summaryByTeam` |
| Feuilles équipe | `=NB.SI.ENS(E:E;équipe;F:F;rame;M:M;priorité)`, Total | `teamAnalysis` |

**Preuve de conformité.** `tests/excel-conformity.test.ts` lit la feuille « Données Globales » du classeur de
référence avec la chaîne de l'application, recalcule tout, et compare **chaque cellule calculée** du Tableau de Bord
et des dix feuilles équipe aux valeurs d'Excel. Pour rejouer la preuve sur une version plus récente du classeur,
remplacez `tests/fixtures/reference-workbook.xlsx` et lancez `npm test`.

### Ce qui est plus robuste que dans Excel

- **Noms d'équipe.** L'export contient « MONTAGE 1␣␣ » (deux espaces finaux), « Peinture », « Chaudro »… et chaque
  formule avait dû être ajustée à la main. L'application compare des clés normalisées (casse, accents, espaces).
- **Équipes et rames nouvelles.** Excel ignorait en silence une équipe ou une rame absente de ses listes. Ici elles
  apparaissent d'office (page, ligne de tableau, entrée de menu), après celles de `config.json`.
- **Colonnes repérées par leur nom d'en-tête**, pas par leur position : l'ordre peut changer.

### Jours ouvrés (`data.businessDays`)

La priorité dépend de la colonne « Jours Ouvrés Écoulés ». Dans le classeur c'est une valeur, pas une formule.

- `auto` (défaut) : la valeur du fichier si elle existe, sinon calcul depuis « Date de création » ;
- `file` : uniquement la valeur du fichier ;
- `computed` : toujours recalculée — `NB.JOURS.OUVRES(création; aujourd'hui) - 1`, hors week-ends et jours fériés français.

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
public/config.json        Configuration lue à l'exécution (listes, options) — versionné : jamais de vrai token
public/config.local.json  Surcharge locale (vraie URL, vrai token) — ignoré par git ; modèle : config.local.example.json
dev-server/cleServer.ts   Plugin Vite : API clé simulée + relais anti-CORS
src/config/               Chargement et validation de config.json
src/services/cleApi.ts    GET authentifié par JWT → classeur
src/services/excelReader.ts  Classeur → anomalies (SheetJS, chargé à la demande)
src/domain/               Règles métier pures : priorité, jours ouvrés, indicateurs
src/stores/anomalies.ts   État central (Pinia) ; les indicateurs sont des valeurs dérivées
src/views/                Tableau de bord, page équipe (un composant pour toutes les équipes)
src/components/           Graphique, tableaux, tuiles, mise en page
tests/                    Conformité Excel + tests unitaires
```

**Convention de langue.** Le code est en anglais : identifiants, commentaires, tests, clés de configuration, classes
CSS. L'interface de l'application (textes affichés, messages d'erreur) et cette documentation sont en français, comme
les données du classeur (noms de colonnes, priorités « Mineure / Majeure / Bloquante »).

## Données personnelles

`mock/cle-export.xlsx` et `tests/fixtures/reference-workbook.xlsx` contiennent des données réelles (noms d'agents).
Ils sont exclus par `.gitignore` : ne les versionnez pas.

## Dépendances notables

- **SheetJS** est installé depuis son dépôt officiel (`cdn.sheetjs.com`) : la version du registre npm (0.18.5) n'est
  plus maintenue et comporte des vulnérabilités connues.
- **TypeScript est épinglé en 6.0.x** : `vue-tsc` ne prend pas encore en charge TypeScript 7 (portage natif).
