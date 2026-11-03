# Glowstick

A phone money app for someone who wants to save but whose spending gets away from them — built for an ADHD brain
with food and gaming impulses. Dark, neon, readable. Everything stays on the device: no account, no server, no
INTERNET permission in the Android app.

What it does:

- **Tracks spending** three optional ways: type it in, import the bank's CSV export, or (Android app only, off until
  you turn it on) capture the bank / Google Wallet "you spent $X at Y" notifications. Auto-categorises, learns
  "always file this here" rules, dedupes.
- **Sees patterns**: category totals vs your 3-month average, six-month trend, weekday vs weekend, top merchants,
  recurring charges it thinks are bills or subscriptions, small-purchase creep. Plain-language suggestions on Home.
- **Bills**: due day, autopay flag, paid/overdue status, one-tap "Paid" that also logs the transaction; CSV imports
  tick bills automatically when a matching charge shows up.
- **Goals with a negotiation**: pick a target; the app works out what's really free each month (income − typical
  spend − other commitments), offers Easy / Steady / All-in plans, and lets you drag either the monthly amount or
  the finish date and see the other one move, with a verdict (comfortable / tight / not happening) and where the gap
  could come from.
- **Loans**: balance, APR, minimum payment; a slider for extra per month shows months and interest saved, "pay off
  by …" solves for the extra needed, amortisation table, log payments.
- **Impulse tools**: weekly allowances (default: a share of income, see below) for eating out, gaming and shopping
  with a "left this week" bar on Home; a **hold timer** ("Want something?") that makes you wait N minutes before a buy,
  tells you what that money means for your goal, and counts skips into a "not spent" pile you can sweep into a goal.
  Week start day is configurable (Sunday by default).
- **Game layer**: XP with a one-second charge-up animation on the top bar (glow and jitter climb as it nears full,
  burst on level-up, optional vibration where the device has it), ten levels, daily streak, three daily quests (two
  actions plus one *restraint* quest — no takeout today, no gaming spend, inside today's slice, no-spend day — scored
  at the end of the day and only for days the app was used), badges, and a **mascot**: a built-in glowstick, or
  pictures you pick yourself in More → Mascot (one shows at random on level-ups, badges and milestones with a speech
  bubble). Mascot **styles** unlock with progress (More → Mascot → Style): colours, faces and accessories for the
  built-in stick, bubble skins and motions for stick and pictures alike. Goal milestones (25/50/75/100%) unlock a
  reward: capped **fun money** (5% of the slice, max $50, never more than 10% of the goal) or a pick from a reward
  list you write yourself.
- **Income** can be entered per month, every two weeks or per week (More → Income & basics, and the intro). It is stored
  as the monthly equivalent (`settings.income`; biweekly ×26/12, weekly ×52/12, to the cent) so every cap, allowance
  and goal figure reads one number; what was typed is kept in `settings.incomeEntered` / `incomeFreq`. Payday is
  always a day of the month.
- **Budget defaults** as a share of income, adjustable per category or overridden in dollars:
  housing 28, utilities 7, groceries 10, transport 9, health 5, loans 7 (needs 66) · eating out 5, gaming 3,
  fun 4, shopping 5, subscriptions 2 (wants 19) · savings 15.

## Use it

- **iPhone / iPad:** open the project's GitHub Pages link in Safari, tap Share, then **Add to Home Screen**. It then
  opens full-screen and works offline. Your data is stored only on that device, in that browser's storage: no account,
  no sync. Safari's "Clear History and Website Data" deletes it, and iOS may clear storage of sites you have not
  opened for a long time, so use More → Backup & reset to save a JSON backup now and then. The Android app (APK) does
  not run on iPhone. On iOS the Android-only options (notification capture, silent SMS, vibration) are not shown.
- **Android phone:** install `Glowstick-store.apk` from the project's Releases page (Android 8 or newer): open the file
  and allow the install, or with USB debugging on: `adb install -r Glowstick-store.apk`.
- **Any desktop browser:** open the Pages link, or build the single file (below) and double-click
  `dist/Glowstick-store.html`. It needs no server and makes no network requests. Same app, no notification capture.
- **Development:** `python3 -m http.server 8779 --directory src`, then http://localhost:8779 (ES modules need http).

## Build and run on Windows / Mac

You need Python 3 for everything. Node 18+ is only for the tests. JDK 17, the Android SDK and Gradle are only for the
Android APK (the wrapper in `android/` fetches Gradle 8.7 itself on first use). Pillow (`pip install pillow`) is only for
the icon and web-app scripts. The HTML build uses nothing outside the Python standard library.

### The web app (one HTML file)

Windows (PowerShell or Command Prompt, in the project folder):

```
python build.py --store
start dist\Glowstick-store.html
node --test
```

Mac (Terminal, in the project folder; `python3` comes with `xcode-select --install`, or `brew install python`):

```
python3 build.py --store
open dist/Glowstick-store.html
node --test
```

`node --test` with no argument runs everything in `test/` (Node 24 rejects `node --test test/`). Install Node with
`winget install OpenJS.NodeJS.LTS` or `brew install node`.

### The Android APK (store flavor, debug build)

Windows:

```
winget install EclipseAdoptium.Temurin.17.JDK
```

Download "Command line tools only" from https://developer.android.com/studio#command-line-tools-only and unzip it so
that `sdkmanager.bat` ends up in `C:\Android\sdk\cmdline-tools\latest\bin`, then:

```
set ANDROID_HOME=C:\Android\sdk
C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\sdk --licenses
C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Flavor store
```

Mac (this script has not been run on a Mac; if it stops, the message says which tool is missing):

```
brew install --cask temurin@17
brew install --cask android-commandlinetools
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
bash scripts/build-apk.sh
```

Put the two `export` lines in `~/.zshrc` to keep them. Both scripts run `build.py --store` first, then Gradle, and write
`dist/Glowstick-store.apk`. They read `JAVA_HOME`, `ANDROID_HOME` and optionally `GRADLE_BIN` (a Gradle 8.7 executable)
from the environment; nothing is hard-coded. Install on a phone with `adb install -r dist/Glowstick-store.apk`
(`adb` is in `$ANDROID_HOME/platform-tools`). `versionName` 1.1.0 / `versionCode` 2 are in `android/app/build.gradle`;
`APP_VERSION` in `src/js/profile.js` should be kept in step by hand. Do not commit APKs; attach them to a GitHub Release.

**Release signing.** Copy `android/keystore.properties.example` to `android/keystore.properties`, point it at your
`.jks`, and the release build type signs with it (`-Release` / `--release`). Both files are git-ignored. Without a valid
signing file, release tasks fail on purpose. Debug builds are fine for local use.

### The iPhone web app (GitHub Pages)

The files at the repository root (`index.html`, `manifest.webmanifest`, `sw.js`, `icon-180.png`, `icon-192.png`,
`icon-512.png`) are the store build wrapped as an installable web app: Apple home-screen meta tags, a manifest, a
service worker for offline use, and a one-time "Add to Home Screen" hint on iOS Safari. Every path in them is relative,
so they work from a sub-folder such as `https://<user>.github.io/glowstick/`. Turn on GitHub Pages for the main branch,
root folder. Installing on an iPhone needs a page served over **https**; a file opened from disk or an http address
installs nothing. To regenerate them after changing the app:

```
python3 build.py --store
python3 tools/make_pwa.py --html dist/Glowstick-store.html --name Glowstick --out . --theme "#070410" --bg "#070410" --icon src/assets/icon.png --key glowstick.a2hs
```

`make_pwa.py` needs Pillow. The service worker caches the page by content hash, so a new build replaces the old one the
next time the app is opened online.

## Profiles

One codebase, two build profiles. The public repository contains only the **store** profile.

- `python build.py --store` writes `dist/Glowstick-store.html` and `android/app/src/store/assets/app/index.html`,
  flips `src/js/profile.js` to `"store"`, replaces `src/data/personal.js` with `export const PERSONAL = null;` and then
  runs a leak check that fails the build if any string from the real `personal.js`, any embedded picture or the
  personal profile marker is in the output. In this repository `personal.js` is already that stub.
- Gradle has a single flavor, `store` (package `app.glowstick.store`, debug label "Glowstick Demo"), with no SMS
  permission anywhere in the manifest. It refuses to build unless its own bundle exists and is a store bundle.
- A fork can keep private defaults (a preset name, tier names, bundled pictures) in `src/data/personal.js` and build
  with plain `python build.py`; keep that file out of public commits.

## Folder map

```
build.py             stdlib bundler: inlines CSS, orders the ES-module graph, writes ONE html file
src/index.html       markup only
src/css/             base (palette), layout (top bar, tabs, XP animation), components, views, mascot
src/js/
  main.js            entry: tabs, XP strip + animation, housekeeping on open/resume
  state.js           the one state object, localStorage key glowstick.v1, defaults, date helpers
  storage.js         localStorage read/write (every call guarded), JSON export, file reading
  backup.js          backup validation; demo.js: fictional demo data
  platform.js        isIOS / canVibrate probes (iPhone hides Android-only options)
  money.js           formatting and lenient amount parsing (EU/US, parentheses)
  categorize.js      keyword table + user rules, merchant key extraction
  csv.js             CSV parser (delimiter sniffing), column guessing, dedupe hash
  analysis.js        totals, averages, recurring detection, weekday/merchant patterns, suggestions
  budget.js          income-percentage defaults, monthly caps, weekly allowances
  bills.js           due dates, status, mark paid, auto-match from imports
  goal.js            available cash, plan offers, verdicts, milestones
  loan.js            amortisation, compare, solve for extra, payment from term
  impulse.js         week maths, allowances, holds, not-spent sweep
  game.js            XP/levels, streak, quests, badges, rewards
  coupons.js         coupon deck and draws; notify.js: "Tell someone" texts (sms: link, iOS and Android forms)
  cosmetics.js       mascot looks (colour, face, accessory, bubble, motion) unlocked by level/badge/tier
  haptics.js         vibration (settings.haptics), skipped where the device has none
  notif.js           Android bridge + notification text parser
  router.js          tab switching
  ui/                one module per screen (home, spend, bills, goals, loans, more) + common, txform, impulse, mascot
  profile.js         PROFILE ("personal" | "store"), IS_STORE, APP_VERSION
src/data/personal.js stub: PERSONAL = null
android/             Kotlin WebView wrapper (MainActivity.kt) and NotifListener.kt; one flavor, store
scripts/             build-apk.ps1 (Windows), build-apk.sh (Mac/Linux)
tools/               make_icon.py (launcher icon), make_pwa.py (iPhone web app), check_readiness.py (headless browser check)
test/                node --test files
index.html, manifest.webmanifest, sw.js, icon-*.png   the GitHub Pages web app (generated, see above)
```

## Data

One localStorage key, `glowstick.v1`: settings, categories, tx, rules, bills, goals, loans, pending (captured
notifications), urges (holds), game. `game.awarded` records XP that is granted at most once (a bill paid for a
given month, a transaction logged today) so undo-then-redo never pays twice; `game.peeked` keeps the once-a-day
mascot nudges (bill due, allowance over, streak) from repeating. "More → Backup & reset" exports/imports the whole thing as JSON. Uninstalling
the APK or clearing the browser's site data deletes it; a backup is the only copy that survives.

## Notification capture (Android app only)

More → Where transactions come from → tick "Bank & Wallet notifications" → Android opens the Notification access
screen → allow Glowstick. The listener stores posted notifications in the app's own preferences (newest 400); the
page pulls them on open/resume, keeps the ones that look like money moving (amount present, not a code/reminder),
and queues them in the Spend → Inbox for a one-tap confirm. Tick specific apps to reduce noise. The parser is
regex-based; odd bank phrasings may need a rule added in `src/js/notif.js`. This does not exist on iPhone or in a
browser; there the option is hidden (iPhone) or shown as unavailable (desktop), and manual entry and CSV import work.

## Privacy

What the code actually does, nothing more:

- **Storage.** All money data (transactions, bills, goals, loans, rules, settings, game state) is in the WebView's /
  browser's localStorage under one key, `glowstick.v1`. Mascot pictures you add are in a second key,
  `glowstick.mascot.images`. Both live on the device only. Every storage call is wrapped, so a browser that refuses
  storage (private mode, full disk) shows "Storage needs attention" instead of failing silently.
- **Transmission.** None by the app. The APK has no `INTERNET` permission; the HTML file makes no network requests
  (fonts, scripts and styles are inlined by `build.py`). No analytics, no crash reporting, no sync, no AI or other
  online service. The only thing fetched when it is hosted as a web app is the app's own files.
- **Notification capture** (Android, off by default). When you tick "Bank & Wallet notifications" the app first shows
  an in-app explainer; only if you confirm does it open Android's Notification-access screen. Once allowed, the
  listener stores the title and text of posted notifications (from the apps you tick, or any app if none are ticked)
  in the app's private SharedPreferences, newest 400. They are read into the Spend inbox when the app is opened or
  resumed and removed from the phone-side queue as they are read. Untick the box or revoke access in Android
  settings to stop. If access is not granted the switch stays off; manual entry and CSV import are unaffected.
- **Texts** ("Tell someone", off until you enter a number). The messaging app opens with the text ready and you press
  Send; the link is `sms:<number>?body=…` on Android and `sms:<number>&body=…` on iPhone. Texts contain the coupon
  name, category and note, and go only to the number you typed. The app has no SMS permission and never sends a
  text itself.
- **Backups** (More → Backup & reset) are a JSON file you save yourself. They include the "Tell someone" name and
  number; they exclude mascot pictures and the phone-side notification queue. They hold your finances in plain text.
- **Not yet written:** a separate privacy policy and terms. More → About & privacy describes what is stored and where.

## Known limits

- No bank API. Balance is not tracked, only flows you log/import/capture.
- Loan maths assumes monthly compounding and that extra goes to principal.
- The category keyword table is US-centric; rules fix anything it gets wrong.
- Vibration needs a phone whose browser has the Vibration API (Android); iPhone Safari does not, so the switch is hidden.
- **Verified:** the 42 node tests; the HTML build and its leak check; the store APK builds with Gradle on Windows; the
  single HTML file runs from a `file://` address in desktop Edge (headless `tools/check_readiness.py`).
- **Not verified:** anything on an iPhone or iPad (Add to Home Screen, the `&body=` sms link, the service worker over
  https, file backup download and restore in Safari), anything on a Mac (including `scripts/build-apk.sh`), and anything
  on a physical Android phone (notification access, Downloads export, picker restore, update persistence).
