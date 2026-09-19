/**
 * Prépare le jeu de données de l'API clé simulée (mock/export-cle.xlsx).
 *
 *   npm run mock:import -- "C:\chemin\vers\classeur.xlsx"
 *
 * Accepte aussi bien le classeur de suivi complet qu'un export clé brut : seule la feuille de
 * données est conservée (« Données Globales », ou la première feuille), et les formules sont
 * remplacées par leurs valeurs — ce que renverrait l'API.
 *
 * Le fichier produit contient des données réelles (noms des agents) : il est ignoré par git.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const FEUILLE_DE_DONNEES = 'Données Globales'

const source = process.argv[2]
if (!source) {
  console.error('Usage : npm run mock:import -- "<chemin du classeur .xlsx>"')
  process.exit(1)
}

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(racine, 'mock', 'export-cle.xlsx')

let classeur
try {
  classeur = XLSX.read(readFileSync(path.resolve(source)), { type: 'buffer', cellDates: false })
} catch (e) {
  console.error(`Lecture impossible : ${source}\n${e instanceof Error ? e.message : e}`)
  process.exit(1)
}

const normaliser = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
const nomFeuille =
  classeur.SheetNames.find((n) => normaliser(n) === normaliser(FEUILLE_DE_DONNEES)) ?? classeur.SheetNames[0]
const feuille = classeur.Sheets[nomFeuille]

// Valeurs seules : on retire les formules (la colonne « Priorité » du classeur en est une).
let formules = 0
for (const [adresse, cellule] of Object.entries(feuille)) {
  if (adresse.startsWith('!') || typeof cellule !== 'object' || cellule === null) continue
  if ('f' in cellule) {
    delete cellule.f
    formules += 1
  }
}
delete feuille['!autofilter']

const sortie = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(sortie, feuille, nomFeuille)

mkdirSync(path.dirname(destination), { recursive: true })
writeFileSync(destination, XLSX.write(sortie, { type: 'buffer', bookType: 'xlsx', compression: true }))

const plage = XLSX.utils.decode_range(feuille['!ref'] ?? 'A1')
console.log(`Feuille « ${nomFeuille} » : ${plage.e.r - plage.s.r} lignes de données, ${formules} formules figées.`)
console.log(`Écrit : ${path.relative(racine, destination)}`)
