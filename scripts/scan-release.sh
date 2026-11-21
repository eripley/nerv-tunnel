#!/bin/bash
set -euo pipefail

case "$(uname -m)" in
  arm64) arch=arm64; sum=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5 ;;
  x86_64) arch=x64; sum=dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709 ;;
  *) exit 1 ;;
esac
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
url="https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_${arch}.tar.gz"
curl --fail --silent --show-error --location --retry 2 "$url" -o "$temp/scanner.tgz"
printf '%s  %s\n' "$sum" "$temp/scanner.tgz" | shasum -a 256 -c -
tar -xzf "$temp/scanner.tgz" -C "$temp" gitleaks
"$temp/gitleaks" git --redact --log-opts=--all .
mkdir "$temp/packed"
archives=(./*.tgz)
test "${#archives[@]}" -eq 1
tar -xzf "${archives[0]}" -C "$temp/packed"
"$temp/gitleaks" dir --redact "$temp/packed"
