# Hockey Scoreboard - eenmalige keystore-generator
# Voer dit eenmalig uit om een ondertekeningssleutel te maken voor de release-APK.

$KeystoreFile = "hockey-scoreboard.keystore"
$Alias        = "hockey"

# keytool zoeken (PATH -> JAVA_HOME -> Android Studio JDK)
function Find-Keytool {
    $kt = Get-Command keytool -ErrorAction SilentlyContinue
    if ($kt) { return $kt.Source }

    $searchRoots = @(
        $env:JAVA_HOME,
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre"
    )
    foreach ($root in $searchRoots) {
        if ($root -and (Test-Path "$root\bin\keytool.exe")) {
            return "$root\bin\keytool.exe"
        }
    }
    # Bredere zoekactie in Program Files
    $hit = Get-ChildItem "C:\Program Files" -Recurse -Name "keytool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return "C:\Program Files\$hit" }
    return $null
}

$Keytool = Find-Keytool
if (-not $Keytool) {
    Write-Error "keytool niet gevonden. Installeer Java of Android Studio."
    exit 1
}
Write-Host "Keytool gevonden: $Keytool" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Hockey Scoreboard Keystore Generator ===" -ForegroundColor Cyan
Write-Host "Bewaar de wachtwoorden goed - je hebt ze nodig om de app te updaten." -ForegroundColor Yellow
Write-Host ""

$StorePass = Read-Host "Keystore-wachtwoord (min 6 tekens)"
$KeyPass   = Read-Host "Sleutelwachtwoord  (min 6 tekens, mag hetzelfde zijn)"

& $Keytool -genkey -v `
    -keystore $KeystoreFile `
    -alias $Alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $StorePass `
    -keypass   $KeyPass `
    -dname "CN=Hockey Scoreboard,OU=Koninja,O=Koninja,L=NL,S=NL,C=NL"

if (-not (Test-Path $KeystoreFile)) {
    Write-Error "Keystore aanmaken mislukt."
    exit 1
}

$Base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $KeystoreFile).Path))

Write-Host ""
Write-Host "========== GitHub Secrets ==========" -ForegroundColor Green
Write-Host "Ga naar: repo -> Settings -> Secrets and variables -> Actions -> New repository secret" -ForegroundColor Cyan
Write-Host ""
Write-Host "KEYSTORE_BASE64 =" -ForegroundColor Yellow
Write-Host $Base64
Write-Host ""
Write-Host "KEYSTORE_PASS = $StorePass" -ForegroundColor Yellow
Write-Host "KEY_ALIAS     = $Alias"     -ForegroundColor Yellow
Write-Host "KEY_PASS      = $KeyPass"   -ForegroundColor Yellow
Write-Host ""
Write-Host "Keystore opgeslagen als: $KeystoreFile (NIET committen aan git)" -ForegroundColor Red
