/**
 * Assembles the package handed to a workstation without Node:
 *
 *   npm run package
 *
 *   package/SuiviAnomalies/
 *     Lancer.bat        double-click
 *     serveur.ps1       local HTTP server + « /cle-proxy » relay (PowerShell, shipped with Windows)
 *     LISEZMOI.txt
 *     site/             the production build
 *
 * `vite build` copies the whole of `public/` into `dist/`, **including config.local.json and its
 * real token**: this script never lets that file through, and writes a placeholder instead. The
 * clé URL, on the other hand, is read from the local configuration and baked into the package —
 * it is an internal address, which no versioned file of this repository carries.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(rootDir, 'package', 'SuiviAnomalies')

/** Reads « api.url » from the local configuration: the package must point at the real clé. */
function localApiUrl() {
  const file = path.join(rootDir, 'public', 'config.local.json')
  if (!existsSync(file)) return ''
  try {
    const local = JSON.parse(readFileSync(file, 'utf-8'))
    return typeof local?.api?.url === 'string' ? local.api.url.trim() : ''
  } catch {
    return ''
  }
}

const apiUrl = localApiUrl()

console.log('Build de production…')
execFileSync('npm', ['run', 'build'], { cwd: rootDir, stdio: 'inherit', shell: true })

rmSync(path.join(rootDir, 'package'), { recursive: true, force: true })
mkdirSync(target, { recursive: true })

cpSync(path.join(rootDir, 'dist'), path.join(target, 'site'), { recursive: true })
for (const name of ['Lancer.bat', 'serveur.ps1', 'LISEZMOI.txt']) {
  cpSync(path.join(rootDir, 'packaging', name), path.join(target, name))
}

// The token of whoever runs the build must never leave with the package.
const packagedLocal = path.join(target, 'site', 'config.local.json')
rmSync(packagedLocal, { force: true })
writeFileSync(packagedLocal, `${JSON.stringify({ api: { jwtToken: '<collez ici votre token JWT>' } }, null, 2)}\n`)

// config.json of the package: the real clé, through the relay of serveur.ps1.
const configFile = path.join(target, 'site', 'config.json')
const config = JSON.parse(readFileSync(configFile, 'utf-8'))
config.api = { ...config.api, url: apiUrl, jwtToken: '', viaProxy: true }
config.data = { ...config.data, businessDays: 'computed' }
writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)

const leaked = readFileSync(packagedLocal, 'utf-8') + readFileSync(configFile, 'utf-8')
if (/ey[A-Za-z0-9_-]{10,}\./.test(leaked)) {
  rmSync(path.join(rootDir, 'package'), { recursive: true, force: true })
  throw new Error('Un token JWT se trouve dans le paquet : assemblage annulé.')
}

console.log(`\nPaquet prêt : ${path.relative(rootDir, target)}`)
console.log(apiUrl === ''
  ? "⚠ « api.url » est vide : renseignez-le dans public/config.local.json avant de reconstruire."
  : `URL clé embarquée : ${apiUrl}`)
console.log('Zippez le dossier SuiviAnomalies et envoyez-le.')
