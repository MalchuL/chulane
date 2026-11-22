#!/usr/bin/env bash
# Assemble the native Linux Electron build and the same production provider modules as the web host.
set -euo pipefail
cd "$(dirname "$0")/../.."
electron_dist=$(dirname "$(node -p "require('electron')")")
case "$(node -p 'process.platform + "/" + process.arch')" in
  linux/x64) arch=amd64 ;;
  linux/arm64) arch=arm64 ;;
  *) echo 'Build on an x64 or arm64 Linux host with its native Electron distribution.' >&2; exit 1 ;;
esac

stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
package_root="$stage/package"
runtime="$package_root/usr/lib/chulane"
app_dir="$runtime/resources/app"
docs="$package_root/usr/share/doc/chulane"
mkdir -p "$app_dir/dist-host" "$package_root"/{DEBIAN,usr/bin,usr/share/applications} "$docs"
cp -a "$electron_dist/." "$runtime/"
mv "$runtime/electron" "$runtime/chulane"
rm "$runtime/resources/default_app.asar"
cp -a dist "$app_dir/"
mkdir "$app_dir/node_modules"
cp -a dist-host/web-runtime/node_modules/{.pnpm,@mastra,zod} "$app_dir/node_modules/"
cp dist-host/{desktop,preload}.cjs "$app_dir/dist-host/"
cat > "$app_dir/package.json" <<'JSON'
{"name":"chulane-poc","productName":"Chulane POC","version":"0.0.0","main":"dist-host/desktop.cjs"}
JSON
cp ../../vendor/cordis/LICENSE "$docs/Cordis-LICENSE"
cp src/renderer/ui/LICENSE.md "$docs/shadcn-ui-LICENSE.md"
ln -s ../lib/chulane/chulane "$package_root/usr/bin/chulane"
install -m 644 packaging/linux/chulane.desktop "$package_root/usr/share/applications/"
# The packaged Chromium sandbox helper must belong to root on installations that need the setuid fallback.
chmod 4755 "$runtime/chrome-sandbox"

version='0.0.0~poc1'
cat > "$package_root/DEBIAN/control" <<CONTROL
Package: chulane
Version: $version
Architecture: $arch
Maintainer: Chulane developers
Section: editors
Priority: optional
Depends: libc6, libgcc-s1, libasound2t64 | libasound2, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, libatk1.0-0t64 | libatk1.0-0, libatspi2.0-0t64 | libatspi2.0-0, libcairo2, libcups2t64 | libcups2, libdbus-1-3, libexpat1, libgbm1, libglib2.0-0t64 | libglib2.0-0, libgtk-3-0t64 | libgtk-3-0, libnspr4, libnss3, libpango-1.0-0, libudev1, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxrandr2
Description: Chulane local-first knowledge workspace
 Edit pages, organize projects and use the workspace agent on the desktop.
CONTROL

output="dist-host/chulane_${version}_${arch}.deb"
dpkg-deb --root-owner-group -Zzstd --build "$package_root" "$stage/chulane.deb"
mv "$stage/chulane.deb" "$output"
echo "$output"
