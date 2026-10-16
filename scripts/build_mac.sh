#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(tr -d '\n' < VERSION)"
APP_NAME="Amazon Carousel Updater V${VERSION}"
APP="dist/${APP_NAME}.app"
mkdir -p .build dist "$APP/Contents/MacOS" "$APP/Contents/Resources"
SDK="$(xcrun --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -O -parse-as-library -sdk "$SDK" \
    -target "${ARCH}-apple-macosx12.0" -module-cache-path "$ROOT/.build/module-cache" \
    Sources/Workbook.swift Sources/App.swift Sources/SelfTest.swift \
    -framework AppKit -framework WebKit -o ".build/updater-${ARCH}"
done
lipo -create .build/updater-arm64 .build/updater-x86_64 -output "$APP/Contents/MacOS/CarouselUpdater"
cp Resources/slate_driver.js "$APP/Contents/Resources/"
cp Resources/slate_fixture.html "$APP/Contents/Resources/"
if [[ -f Resources/AppIcon.icns ]]; then cp Resources/AppIcon.icns "$APP/Contents/Resources/"; fi
/usr/libexec/PlistBuddy -c 'Clear dict' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string CarouselUpdater" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.mbf.amazoncarouselupdater" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleName string ${APP_NAME}" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string ${APP_NAME}" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string ${VERSION}" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string ${VERSION}" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundlePackageType string APPL' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :LSMinimumSystemVersion string 12.0' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :NSHighResolutionCapable bool true' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string AppIcon' "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "dist/Amazon-Carousel-Updater-V${VERSION}-macOS-universal.zip"
shasum -a 256 "dist/Amazon-Carousel-Updater-V${VERSION}-macOS-universal.zip" > dist/SHA256SUMS.txt
echo "Built ${APP}"
