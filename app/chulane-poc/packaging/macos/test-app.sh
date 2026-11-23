#!/usr/bin/env bash
# Install the ZIP in a disposable Applications folder and exercise its executable across restarts.
set -euo pipefail
cd "$(dirname "$0")/../.."
archive=${1:?Pass the path to the macOS archive}
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
ditto -x -k "$archive" "$stage/Applications"
bundle="$stage/Applications/Chulane.app"
codesign --verify --deep --strict "$bundle"
export CHULANE_TEST_INSTALLED_DESKTOP="$bundle/Contents/MacOS/Chulane"
pnpm smoke:installed
pnpm smoke:agent
