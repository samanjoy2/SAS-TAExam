#!/bin/sh
# Writes the browser runtime config from the API_BASE_URL environment variable at container start,
# so the backend URL can be changed without rebuilding the image.
set -eu
API_BASE_URL="${API_BASE_URL:-http://localhost:8080}"
# Drop characters that could break out of the JS string literal.
SAFE=$(printf '%s' "$API_BASE_URL" | tr -d '"\\<>')
printf 'window.__APP_CONFIG__ = { API_BASE_URL: "%s" };\n' "$SAFE" > /usr/share/nginx/html/config.js
echo "app-config: API_BASE_URL=$SAFE"
