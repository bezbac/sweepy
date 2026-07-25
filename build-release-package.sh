#!/usr/bin/env bash

set -euo pipefail

package_version="$(node --print "require('./package.json').version")"

rm -rf -- dist/package dist/release
mkdir -p dist/package dist/release
cp dist/cli.js dist/package/cli.js
cp README.md dist/package/README.md

cat > dist/package/package.json <<EOF
{
  "name": "sweepy",
  "version": "${package_version}",
  "type": "module",
  "bin": {
    "sweepy": "./cli.js"
  },
  "engines": {
    "node": ">=22"
  }
}
EOF

npm pack ./dist/package --pack-destination ./dist/release
