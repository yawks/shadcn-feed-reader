#!/usr/bin/env bash

set -euo pipefail

readonly PACKAGE_NAME="net.yawks.shadcn.feedreader"
readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DEFAULT_DEBUG_APK="$PROJECT_ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
readonly DEFAULT_RELEASE_APK="$PROJECT_ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"

apk_path="$DEFAULT_DEBUG_APK"
device_serial=""
launch_app=true

usage() {
  printf '%s\n' \
    "Usage: $0 [options]" \
    "" \
    "Install an already-built Android APK through ADB and launch the app." \
    "" \
    "Options:" \
    "  --apk PATH       Install a specific APK" \
    "  --release        Install the default signed release APK" \
    "  --device SERIAL  Target a specific device from 'adb devices'" \
    "  --no-launch      Install without launching the application" \
    "  -h, --help       Show this help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk)
      [[ $# -ge 2 ]] || { printf 'Missing value for --apk\n' >&2; exit 2; }
      apk_path="$2"
      shift 2
      ;;
    --release)
      apk_path="$DEFAULT_RELEASE_APK"
      shift
      ;;
    --device)
      [[ $# -ge 2 ]] || { printf 'Missing value for --device\n' >&2; exit 2; }
      device_serial="$2"
      shift 2
      ;;
    --no-launch)
      launch_app=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
  adb_bin="$ANDROID_HOME/platform-tools/adb"
elif command -v adb >/dev/null 2>&1; then
  adb_bin="$(command -v adb)"
else
  printf 'ADB was not found. Set ANDROID_HOME or add adb to PATH.\n' >&2
  exit 1
fi

if [[ ! -f "$apk_path" ]]; then
  printf 'APK not found: %s\n' "$apk_path" >&2
  if [[ "$apk_path" == "$DEFAULT_DEBUG_APK" ]]; then
    printf 'Build it first with: pnpm tauri:android:build:debug\n' >&2
  elif [[ "$apk_path" == "$DEFAULT_RELEASE_APK" ]]; then
    printf 'The release APK must be signed before it can be installed.\n' >&2
  fi
  exit 1
fi

connected_devices=()
while IFS= read -r connected_device; do
  connected_devices+=("$connected_device")
done < <("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1 }')

if [[ -n "$device_serial" ]]; then
  device_found=false
  for connected_device in "${connected_devices[@]}"; do
    if [[ "$connected_device" == "$device_serial" ]]; then
      device_found=true
      break
    fi
  done
  if [[ "$device_found" == false ]]; then
    printf 'Device is not connected or authorized: %s\n' "$device_serial" >&2
    "$adb_bin" devices -l >&2
    exit 1
  fi
elif [[ ${#connected_devices[@]} -eq 0 ]]; then
  printf 'No authorized Android device found.\n' >&2
  "$adb_bin" devices -l >&2
  exit 1
elif [[ ${#connected_devices[@]} -gt 1 ]]; then
  printf 'Several devices are connected; select one with --device SERIAL:\n' >&2
  "$adb_bin" devices -l >&2
  exit 1
else
  device_serial="${connected_devices[0]}"
fi

printf 'Installing %s on %s...\n' "$apk_path" "$device_serial"
"$adb_bin" -s "$device_serial" install -r "$apk_path"

if [[ "$launch_app" == true ]]; then
  printf 'Launching %s...\n' "$PACKAGE_NAME"
  "$adb_bin" -s "$device_serial" shell am force-stop "$PACKAGE_NAME"
  "$adb_bin" -s "$device_serial" shell monkey \
    -p "$PACKAGE_NAME" \
    -c android.intent.category.LAUNCHER \
    1 >/dev/null
fi

printf 'Done.\n'
