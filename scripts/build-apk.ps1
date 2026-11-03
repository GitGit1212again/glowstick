# Builds a Glowstick APK on Windows.
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Flavor store     -> dist\Glowstick-store.apk (debug build)
#   add -Release for the release build type (needs android\keystore.properties, see android\keystore.properties.example)
#   -Flavor personal exists only in a checkout that has android\app\src\personal (the owner's private tree); with no
#   -Flavor, that checkout builds personal and everyone else builds store.
# Runs `python build.py --store` (or `python build.py` for personal) first so the right web bundle is packaged.
#
# Tools come from the environment, not from paths in this file:
#   JAVA_HOME     a JDK 17 (e.g. Temurin 17). If unset, C:\Program Files\{Eclipse Adoptium,Java,Microsoft} is searched.
#   ANDROID_HOME  the Android SDK folder (platform android-34 and build-tools installed; cmdline-tools + sdkmanager)
#   GRADLE_BIN    optional path to a Gradle 8.7 gradle.bat. If unset, android\gradlew.bat is used (it downloads Gradle 8.7
#                 on first run), then `gradle` on PATH.
# Machine-specific values for one PC can go in scripts\local-env.ps1 (git-ignored; sourced first if it exists).
param(
  [ValidateSet('', 'personal', 'store')] [string] $Flavor = '',
  [switch] $Release
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Fail($msg) { Write-Host "ERROR: $msg"; exit 1 }

$localEnv = Join-Path $PSScriptRoot 'local-env.ps1'
if (Test-Path $localEnv) { . $localEnv }

if (-not $Flavor) { $Flavor = if (Test-Path "$root\android\app\src\personal") { 'personal' } else { 'store' } }
if ($Flavor -eq 'personal' -and -not (Test-Path "$root\android\app\src\personal")) {
  Fail "the personal flavor is not part of this checkout. Use -Flavor store."
}

# 1. bundle the web app for this profile
$py = Get-Command python -ErrorAction SilentlyContinue
$pyArgs = @()
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue; $pyArgs = @('-3') }
if (-not $py) { Fail "Python 3 was not found. Install it from https://www.python.org/downloads/ and reopen the terminal." }
Push-Location $root
if ($Flavor -eq 'store') { & $py.Source @pyArgs build.py --store } else { & $py.Source @pyArgs build.py }
$bundleExit = $LASTEXITCODE
Pop-Location
if ($bundleExit -ne 0) { Write-Host "build.py failed (exit $bundleExit); not building the APK"; exit $bundleExit }

# 2. find JDK 17, the Android SDK and Gradle
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path "$jdk\bin\java.exe")) {
  $jdk = $null
  foreach ($base in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft")) {
    if (Test-Path $base) {
      $jdk = Get-ChildItem $base -Directory | Where-Object Name -like 'jdk-17*' | Select-Object -First 1 -Expand FullName
      if ($jdk) { break }
    }
  }
}
if (-not $jdk) { Fail "JDK 17 not found. Install Temurin 17 (winget install EclipseAdoptium.Temurin.17.JDK) or set JAVA_HOME to a JDK 17 folder." }
$verLine = (& cmd /c "`"$jdk\bin\java.exe`" -version 2>&1" | Select-Object -First 1)
if ($verLine -notmatch '"(\d+)') { Fail "could not read the Java version from $jdk\bin\java.exe" }
if ([int]$Matches[1] -lt 17) { Fail "JAVA_HOME ($jdk) is Java $($Matches[1]); this project needs JDK 17." }
$env:JAVA_HOME = $jdk; $env:PATH = "$jdk\bin;$env:PATH"

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path "$sdk\platforms")) { Fail "Android SDK not found at '$sdk'. Set ANDROID_HOME to the SDK folder; install it with the command-line tools: sdkmanager `"platforms;android-34`" `"build-tools;34.0.0`" (see README)." }
$env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk
if (-not (Test-Path "$root\android\local.properties")) { Set-Content -Encoding ascii "$root\android\local.properties" ("sdk.dir=" + ($sdk -replace '\\', '/')) }

$gradle = $null
if ($env:GRADLE_BIN -and (Test-Path $env:GRADLE_BIN)) { $gradle = $env:GRADLE_BIN }
elseif (Test-Path "$root\android\gradlew.bat") { $gradle = "$root\android\gradlew.bat" }
elseif (Get-Command gradle -ErrorAction SilentlyContinue) { $gradle = (Get-Command gradle).Source }
if (-not $gradle) { Fail "Gradle not found. Use the wrapper (android\gradlew.bat), or set GRADLE_BIN to a Gradle 8.7 gradle.bat." }

# 3. gradle
$type = if ($Release) { 'Release' } else { 'Debug' }
$flavorCap = $Flavor.Substring(0, 1).ToUpper() + $Flavor.Substring(1)
$task = "assemble$flavorCap$type"
Write-Host "Flavor: $Flavor   Build type: $type   Gradle task: $task   Gradle: $gradle"
Set-Location "$root\android"
& $gradle $task --no-daemon --console=plain 2>&1
$gradleExit = $LASTEXITCODE
Write-Host "GRADLE-EXIT $gradleExit"
if ($gradleExit -ne 0) { Write-Host "Gradle failed; existing dist APK was not replaced."; exit $gradleExit }

# 4. collect
$typeLower = $type.ToLower()
$apk = "$root\android\app\build\outputs\apk\$Flavor\$typeLower\app-$Flavor-$typeLower.apk"
if (-not (Test-Path $apk)) { $apk = Get-ChildItem "$root\android\app\build\outputs\apk\$Flavor\$typeLower\*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1 -Expand FullName }
if ($apk -and (Test-Path $apk)) {
  New-Item -ItemType Directory -Force "$root\dist" | Out-Null
  $out = if ($Flavor -eq 'store') { "$root\dist\Glowstick-store.apk" } else { "$root\dist\Glowstick.apk" }
  Copy-Item $apk $out -Force
  $msg = "APK ($Flavor/$typeLower) " + [math]::Round((Get-Item $apk).Length / 1MB, 1) + " MB -> " + $out
  # scripts\local-env.ps1 may define $AfterBuild = { param($apk, $flavor) ... } to put a copy somewhere on that PC
  if ($AfterBuild) { $extra = & $AfterBuild $apk $Flavor; if ($extra) { $msg += " and " + $extra } }
  Write-Host $msg
} else {
  Write-Host "No APK produced for $Flavor/$typeLower; see the Gradle output above."
  exit 1
}
