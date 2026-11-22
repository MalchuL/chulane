#!/usr/bin/env bash
# Install into a disposable package database, then run the desktop workflow with the installed launcher.
set -euo pipefail
cd "$(dirname "$0")/../.."
deb=$(realpath "${1:?Pass the path to the built .deb}")
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
root="$stage/root"
mkdir -p "$root/var/lib/dpkg"
# Validate prerequisites against this desktop's real package inventory without changing it.
cp /var/lib/dpkg/status "$root/var/lib/dpkg/status"
unshare --user --map-root-user dpkg --root="$root" --log="$stage/install.log" --install "$deb" >"$stage/install-output" 2>&1 || {
  tail -20 "$stage/install-output" >&2
  exit 1
}
dpkg-query --admindir="$root/var/lib/dpkg" --showformat='${Status}\n' --show chulane | grep -Fx 'install ok installed'
export CHULANE_TEST_INSTALLED_DESKTOP="$root/usr/bin/chulane"
pnpm smoke desktop
pnpm smoke:agent
