#!/usr/bin/env bash
# Run the Maestro mobile flows against the hosted Dev project on a simulator or emulator.
# Usage: scripts/mobile-e2e.sh <ios|android> [flow-file ...]   (default: every flow in apps/mobile/.maestro/flows)
# Needs: the dev client already installed (iOS: xcodebuild the Athleit scheme; Android: pnpm --filter mobile android),
# Java 17, Maestro, watchman, and apps/mobile/.env.local pointing at the Dev project (public values only).
# Users are named e2e-<RUN>-<role>@example.test and removed afterwards with scripts/e2e-cleanup.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
platform="${1:?usage: mobile-e2e.sh <ios|android> [flow ...]}"; shift || true
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
run="e2e-$(date +%s)"
logs="$(mktemp -d)"

command -v maestro >/dev/null || { echo "maestro is not installed"; exit 2; }
command -v watchman >/dev/null || echo "warning: watchman is missing; Metro may not see edits (brew install watchman)"

# Refuse to run against anything but the Dev project.
url="$(grep -E '^EXPO_PUBLIC_SUPABASE_URL=' apps/mobile/.env.local | cut -d= -f2-)"
[[ "$url" == *qzvwoqnykpmvzdnetkmy* ]] || { echo "EXPO_PUBLIC_SUPABASE_URL is not the Dev project"; exit 2; }
key="$(grep -E '^EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=' apps/mobile/.env.local | cut -d= -f2-)"
[[ -z "$key" || "$key" == pk_test_* ]] || { echo "Stripe key is not a test key"; exit 2; }

case "$platform" in
  ios) device="$(xcrun simctl list devices booted | grep -o '[0-9A-F-]\{36\}' | head -1)"
       [[ -n "$device" ]] || { echo "no booted iOS simulator (xcrun simctl boot 'iPhone 17 Pro')"; exit 2; } ;;
  android) device="$(adb devices | awk '/emulator-.*device$/{print $1; exit}')"
       [[ -n "$device" ]] || { echo "no running Android emulator"; exit 2; }
       adb reverse tcp:8081 tcp:8081 >/dev/null
       adb shell settings put secure stylus_handwriting_enabled 0
       for _ in $(seq 1 30); do adb shell ping -c1 -W2 qzvwoqnykpmvzdnetkmy.supabase.co >/dev/null 2>&1 && break; sleep 2; done ;;
  *) echo "platform must be ios or android"; exit 2 ;;
esac

# Always start Metro fresh: in this checkout a running Metro kept serving old code after edits (D-030).
pkill -f "expo start" 2>/dev/null || true; sleep 2
(cd apps/mobile && LANG=en_US.UTF-8 CI=1 nohup pnpm exec expo start --dev-client --port 8081 --clear >"$logs/metro.log" 2>&1 &)
for _ in $(seq 1 60); do curl -sf localhost:8081/status >/dev/null && break; sleep 2; done

flows=("$@"); [[ ${#flows[@]} -gt 0 ]] || flows=(apps/mobile/.maestro/flows/*.yaml)
fail=0
for f in "${flows[@]}"; do
  echo "== $f ($platform, $run)"
  # iOS keeps the Supabase session in the Keychain across app data resets, and a signed-in start hides the app from the
  # dev-client overlay; start every flow signed out.
  [[ "$platform" == ios ]] && xcrun simctl keychain "$device" reset >/dev/null 2>&1 || true
  maestro --device "$device" test -e RUN="$run" --format junit --output "$logs/$(basename "$f" .yaml).xml" "$f" || fail=1
done
echo "reports: $logs"
bash scripts/e2e-cleanup.sh >/dev/null 2>&1 || echo "cleanup did not finish; run scripts/e2e-cleanup.sh"
exit $fail
