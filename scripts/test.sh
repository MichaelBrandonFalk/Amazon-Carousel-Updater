#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .build/test-fixtures
python3 Tests/make_fixtures.py .build/test-fixtures
xcrun swiftc -swift-version 5 -module-cache-path "$ROOT/.build/module-cache" Sources/Workbook.swift Tests/WorkbookTests.swift -o .build/workbook-tests
.build/workbook-tests .build/test-fixtures "$@"
VERSION="$(tr -d '\n' < VERSION)"
"dist/Amazon Carousel Updater V${VERSION}.app/Contents/MacOS/CarouselUpdater" --self-test
