#!/usr/bin/env bash
# Smoke test for compose.yaml: both images build, the app answers /healthz on its volume,
# the app reaches the browser service, and data survives recreating the app's container.
# Run from the repository root. Uses its own .env and project name, and removes both after.
set -euo pipefail

export COMPOSE_PROJECT_NAME=sandbox-smoke
port=${SMOKE_PORT:-8099}
code=smoke-setup-code
compose=(docker compose ${COMPOSE_FILES:-})

if [ -e .env ]; then echo "A .env already exists here; not overwriting it." >&2; exit 1; fi
printf 'ACCESS_CODE=%s\nBROWSER_TOKEN=%s\nSANDBOX_PORT=%s\n' "$code" "$(openssl rand -hex 24)" "$port" > .env
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then "${compose[@]}" logs --no-color --tail 80 || true; fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f .env
  exit "$status"
}
trap cleanup EXIT

step() { echo "== $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

health() {
  for _ in $(seq 1 60); do
    if body=$(curl -fsS "http://127.0.0.1:$port/healthz" 2>/dev/null); then echo "$body"; return 0; fi
    sleep 2
  done
  return 1
}

humans() {
  "${compose[@]}" exec -T app node --no-warnings -e \
    "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/workstation.db');console.log(d.prepare(\"select name from users where kind='human' order by name\").all().map(r=>r.name).join(','))"
}

step "Build both images"
"${compose[@]}" build

step "Start"
"${compose[@]}" up -d
body=$(health) || fail "/healthz never answered"
echo "$body"
echo "$body" | grep -q '"ok":true' || fail "/healthz did not say ok"

step "The app runs in invite mode with the setup code"
config=$(curl -fsS "http://127.0.0.1:$port/api/config")
echo "$config"
echo "$config" | grep -q '"mode":"invite"' || fail "not in invite mode"
echo "$config" | grep -q '"accessCode":true' || fail "no setup code"

step "The browser service is up and the app can reach it"
[ "$("${compose[@]}" ps --status running --services | grep -c '^browser$')" = 1 ] || fail "browser service is not running"
reach_browser='const s=require("node:net").connect(3000,"browser");s.on("connect",()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1))'
for i in $(seq 1 30); do
  if "${compose[@]}" exec -T app node -e "$reach_browser"; then break; fi
  [ "$i" = 30 ] && fail "the app cannot reach browser:3000"
  sleep 2
done

step "Join with the setup code"
joined=$(curl -fsS -X POST "http://127.0.0.1:$port/api/join" -H 'content-type: application/json' \
  -H 'x-workstation: 1' -d "{\"name\":\"Smoke Tester\",\"code\":\"$code\"}")
echo "$joined"
echo "$joined" | grep -q '"ok":true' || fail "joining with the setup code failed"
[ "$(humans)" = "Smoke Tester" ] || fail "the new person is not in the database"

step "Data survives recreating the app's container"
"${compose[@]}" up -d --force-recreate --no-deps app
health >/dev/null || fail "/healthz never answered after the recreate"
[ "$(humans)" = "Smoke Tester" ] || fail "the person was lost when the container was recreated"

echo "Compose smoke test passed."
