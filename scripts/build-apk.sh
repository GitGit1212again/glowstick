#!/usr/bin/env bash
# Builds a Glowstick APK on macOS (or Linux). Bash equivalent of scripts/build-apk.ps1.
#
#   bash scripts/build-apk.sh                 store flavor, debug build  -> dist/Glowstick-store.apk
#   bash scripts/build-apk.sh --release       release build (needs android/keystore.properties, see the example file)
#   bash scripts/build-apk.sh --flavor personal  only in a checkout that has android/app/src/personal (the owner's tree)
#
# NOT TESTED ON A MAC. It was written and checked (bash -n, and a run under Git Bash on Windows) without a Mac or
# a phone. If it fails on your Mac, the error message names the missing piece; the README has the exact commands.
#
# Tools come from the environment, not from paths in this file:
#   JAVA_HOME     a JDK 17 (macOS: `brew install --cask temurin@17`; found automatically via /usr/libexec/java_home)
#   ANDROID_HOME  the Android SDK folder with platform android-34 and build-tools 34.0.0 (see the README for sdkmanager)
#   GRADLE_BIN    optional: a Gradle 8.7 executable. Default: android/gradlew (downloads Gradle 8.7 on first run),
#                 then `gradle` on PATH.
# Machine-specific values for one computer can go in scripts/local-env.sh (git-ignored; sourced first if it exists).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLAVOR=""
TYPE="Debug"

fail() { echo "ERROR: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --flavor) [ $# -ge 2 ] || fail "--flavor needs store or personal"; FLAVOR="$2"; shift 2 ;;
    --flavor=*) FLAVOR="${1#--flavor=}"; shift ;;
    --release) TYPE="Release"; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "unknown argument: $1 (try --help)" ;;
  esac
done

# shellcheck disable=SC1091
[ -f "$ROOT/scripts/local-env.sh" ] && . "$ROOT/scripts/local-env.sh"

if [ -z "$FLAVOR" ]; then
  if [ -d "$ROOT/android/app/src/personal" ]; then FLAVOR="personal"; else FLAVOR="store"; fi
fi
case "$FLAVOR" in store|personal) ;; *) fail "flavor must be store or personal, not '$FLAVOR'" ;; esac
if [ "$FLAVOR" = "personal" ] && [ ! -d "$ROOT/android/app/src/personal" ]; then
  fail "the personal flavor is not part of this checkout. Use --flavor store."
fi

# 1. bundle the web app for this profile
PY=""
for c in python3 python; do
  # run it, not just look it up: some systems have a placeholder `python3` that only opens an installer
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info[0] != 3)' >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || fail "Python 3 not found. On a Mac: xcode-select --install   (or: brew install python)"
( cd "$ROOT"
  if [ "$FLAVOR" = "store" ]; then "$PY" build.py --store; else "$PY" build.py; fi ) \
  || fail "build.py failed; not building the APK"

# 2. JDK 17
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  JAVA_HOME=""
  if [ -x /usr/libexec/java_home ]; then JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"; fi
fi
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  fail "JDK 17 not found. On a Mac:
    brew install --cask temurin@17
    export JAVA_HOME=\"\$(/usr/libexec/java_home -v 17)\"
  On Linux install openjdk-17 and set JAVA_HOME to it."
fi
JAVA_MAJOR="$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')"
case "$JAVA_MAJOR" in ''|*[!0-9]*) fail "could not read the Java version from $JAVA_HOME/bin/java" ;; esac
[ "$JAVA_MAJOR" -ge 17 ] || fail "JAVA_HOME ($JAVA_HOME) is Java $JAVA_MAJOR; this project needs JDK 17."
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# 3. Android SDK
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
  for c in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -d "$c/platforms" ]; then SDK="$c"; break; fi
  done
fi
if [ -z "$SDK" ] || [ ! -d "$SDK/platforms" ]; then
  fail "Android SDK not found (looked at ANDROID_HOME='${ANDROID_HOME:-}'). On a Mac:
    brew install --cask android-commandlinetools
    export ANDROID_HOME=\"\$HOME/Library/Android/sdk\"
    yes | sdkmanager --sdk_root=\"\$ANDROID_HOME\" --licenses
    sdkmanager --sdk_root=\"\$ANDROID_HOME\" \"platform-tools\" \"platforms;android-34\" \"build-tools;34.0.0\"
  then run this script again (add the export line to ~/.zshrc to keep it)."
fi
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
if [ ! -f "$ROOT/android/local.properties" ]; then printf 'sdk.dir=%s\n' "$SDK" > "$ROOT/android/local.properties"; fi

# 4. Gradle: GRADLE_BIN, then the wrapper in this repo, then `gradle` on PATH
if [ -n "${GRADLE_BIN:-}" ] && [ -x "$GRADLE_BIN" ]; then GRADLE=("$GRADLE_BIN")
elif [ -f "$ROOT/android/gradlew" ]; then GRADLE=(sh "$ROOT/android/gradlew")
elif command -v gradle >/dev/null 2>&1; then GRADLE=(gradle)
else fail "Gradle not found. android/gradlew is missing from this checkout; install Gradle 8.7 (https://gradle.org/releases/) and set GRADLE_BIN to its bin/gradle."; fi

# 5. build
TASK="assemble$(printf '%s' "${FLAVOR:0:1}" | tr '[:lower:]' '[:upper:]')${FLAVOR:1}$TYPE"
echo "Flavor: $FLAVOR   Build type: $TYPE   Gradle task: $TASK   Gradle: ${GRADLE[*]}"
( cd "$ROOT/android" && "${GRADLE[@]}" "$TASK" --no-daemon --console=plain ) \
  || fail "Gradle failed; the existing dist APK was not replaced."

# 6. collect
TYPE_LOWER="$(printf '%s' "$TYPE" | tr '[:upper:]' '[:lower:]')"
APK_DIR="$ROOT/android/app/build/outputs/apk/$FLAVOR/$TYPE_LOWER"
APK="$APK_DIR/app-$FLAVOR-$TYPE_LOWER.apk"
if [ ! -f "$APK" ]; then APK="$(ls "$APK_DIR"/*.apk 2>/dev/null | head -1 || true)"; fi
[ -n "$APK" ] && [ -f "$APK" ] || fail "no APK was produced in $APK_DIR; see the Gradle output above."
mkdir -p "$ROOT/dist"
if [ "$FLAVOR" = "store" ]; then OUT="$ROOT/dist/Glowstick-store.apk"; else OUT="$ROOT/dist/Glowstick.apk"; fi
cp "$APK" "$OUT"
echo "APK ($FLAVOR/$TYPE_LOWER) $(wc -c < "$OUT" | tr -d ' ') bytes -> $OUT"
echo "Install on a phone with USB debugging:  adb install -r \"$OUT\""
