# Serveur local du Suivi des anomalies.
#
# Sert les fichiers du dossier « site » et expose « /cle-proxy », le relais qui contourne le
# blocage CORS : l'appel à clé part de ce processus, pas du navigateur. C'est l'équivalent de
# dev-server/cleServer.ts, en PowerShell, pour une machine sans Node.
#
# Aucune installation : PowerShell et .NET sont livrés avec Windows.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$racine = Split-Path -Parent $MyInvocation.MyCommand.Path
$site = Join-Path $racine 'site'
if (-not (Test-Path $site)) {
  Write-Host "Dossier « site » introuvable a cote de ce script." -ForegroundColor Red
  Read-Host 'Appuyez sur Entree pour fermer'
  exit 1
}

$typesMime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8';   '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml';             '.ico' = 'image/x-icon'
  '.png' = 'image/png';                 '.jpg' = 'image/jpeg'
  '.woff' = 'font/woff';                '.woff2' = 'font/woff2'
  '.csv' = 'text/csv; charset=utf-8';   '.map' = 'application/json; charset=utf-8'
}

# « api.url » de config.json, surchargé par config.local.json quand il existe : le navigateur
# applique la même règle, le relais doit donc viser la même adresse.
function Get-UrlApi {
  $url = ''
  foreach ($nom in @('config.json', 'config.local.json')) {
    $chemin = Join-Path $site $nom
    if (-not (Test-Path $chemin)) { continue }
    try {
      $conf = Get-Content $chemin -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($conf.api -and $conf.api.url) { $url = [string]$conf.api.url }
    } catch {
      Write-Host "  $nom ignore : JSON invalide." -ForegroundColor Yellow
    }
  }
  return $url.Trim()
}

function Send-Json {
  param($reponse, [int]$code, [string]$message)
  $reponse.StatusCode = $code
  $reponse.ContentType = 'application/json; charset=utf-8'
  $corps = [Text.Encoding]::UTF8.GetBytes((@{ error = $message } | ConvertTo-Json -Compress))
  $reponse.ContentLength64 = $corps.Length
  $reponse.OutputStream.Write($corps, 0, $corps.Length)
}

# Premier port libre à partir de 8080 : un autre programme peut déjà occuper le port.
$ecouteur = $null
foreach ($port in 8080..8099) {
  try {
    $essai = New-Object System.Net.HttpListener
    $essai.Prefixes.Add("http://localhost:$port/")
    $essai.Start()
    $ecouteur = $essai
    break
  } catch {
    if ($essai) { $essai.Close() }
  }
}
if (-not $ecouteur) {
  Write-Host 'Aucun port libre entre 8080 et 8099.' -ForegroundColor Red
  Read-Host 'Appuyez sur Entree pour fermer'
  exit 1
}

$adresse = $ecouteur.Prefixes[0]
Write-Host ''
Write-Host '  Suivi des anomalies' -ForegroundColor Green
Write-Host "  $adresse"
Write-Host ''
Write-Host '  Laissez cette fenetre ouverte pendant l utilisation.'
Write-Host '  Fermez-la (ou Ctrl+C) pour arreter l application.'
Write-Host ''
Start-Process $adresse

try {
  while ($ecouteur.IsListening) {
    $contexte = $ecouteur.GetContext()
    $requete = $contexte.Request
    $reponse = $contexte.Response
    $chemin = $requete.Url.AbsolutePath

    try {
      if ($chemin -eq '/cle-proxy') {
        $cible = Get-UrlApi
        if (-not ($cible -match '^https?://')) {
          Send-Json $reponse 500 'Relais : « api.url » doit etre une URL absolue (http ou https) dans config.json ou config.local.json.'
        } else {
          try {
            $appel = [System.Net.HttpWebRequest]::Create($cible)
            $appel.Method = 'GET'
            $appel.Timeout = 60000
            $entete = $requete.Headers['Authorization']
            if ($entete) { $appel.Headers.Add('Authorization', $entete) }
            $recu = $appel.GetResponse()
            $reponse.StatusCode = [int]$recu.StatusCode
            if ($recu.ContentType) { $reponse.ContentType = $recu.ContentType }
            $flux = New-Object IO.MemoryStream
            $recu.GetResponseStream().CopyTo($flux)
            $octets = $flux.ToArray()
            $reponse.ContentLength64 = $octets.Length
            $reponse.OutputStream.Write($octets, 0, $octets.Length)
            $recu.Close()
          } catch [System.Net.WebException] {
            # Une erreur HTTP (401, 404...) porte une reponse : la transmettre telle quelle,
            # l application sait alors expliquer un token refuse ou expire.
            $recu = $_.Exception.Response
            if ($recu) {
              $reponse.StatusCode = [int]$recu.StatusCode
              $flux = New-Object IO.MemoryStream
              $recu.GetResponseStream().CopyTo($flux)
              $octets = $flux.ToArray()
              $reponse.ContentLength64 = $octets.Length
              $reponse.OutputStream.Write($octets, 0, $octets.Length)
            } else {
              Send-Json $reponse 502 "Relais : impossible de joindre cle. $($_.Exception.Message)"
            }
          }
        }
      } else {
        if ($chemin -eq '/') { $chemin = '/index.html' }
        # Le chemin demande est resolu sous « site » : rien au-dessus n est servi.
        $fichier = Join-Path $site ($chemin.TrimStart('/') -replace '/', '\')
        $complet = [IO.Path]::GetFullPath($fichier)
        if (-not $complet.StartsWith([IO.Path]::GetFullPath($site), [StringComparison]::OrdinalIgnoreCase)) {
          Send-Json $reponse 403 'Chemin refuse.'
        } elseif (Test-Path $complet -PathType Leaf) {
          $octets = [IO.File]::ReadAllBytes($complet)
          $type = $typesMime[[IO.Path]::GetExtension($complet).ToLower()]
          if (-not $type) { $type = 'application/octet-stream' }
          $reponse.ContentType = $type
          $reponse.Headers.Add('Cache-Control', 'no-store')
          $reponse.ContentLength64 = $octets.Length
          $reponse.OutputStream.Write($octets, 0, $octets.Length)
        } else {
          Send-Json $reponse 404 'Fichier introuvable.'
        }
      }
    } catch {
      try { Send-Json $reponse 500 $_.Exception.Message } catch { }
    }

    $reponse.OutputStream.Close()
  }
} finally {
  $ecouteur.Stop()
  $ecouteur.Close()
}
