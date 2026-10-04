#!/usr/bin/env bash
# Builds the web image from the published Dockerfile and runs its own entrypoint (start.mjs: telemetry, migrations,
# server) locked down as a restricted cluster may run it: a non-root user, a read-only root filesystem, no
# capabilities, and a Postgres role that owns its database and nothing more. Nothing else in CI runs the image.
# Usage: scripts/smoke-image.sh [Dockerfile]   (default out/k8s/web.Dockerfile, from `DEPLOY_TARGET=k8s aspire publish`;
# run from the repository root. CI: e2e.yml, after "Check publish output".)
set -euo pipefail

dockerfile=${1:-out/k8s/web.Dockerfile}
id=matherlynet-smoke-$$
image=$id:local
net=$id pg=$id-pg web=$id-web early=$id-early
uri=postgresql://app:app-pw@$pg:5432/app

# Prints the container's exit code once it stops, or nothing if it is still running after $2 seconds.
exit_code_within() {
  for _ in $(seq "$2"); do
    if [ "$(docker inspect -f '{{.State.Running}}' "$1")" = false ]; then
      docker inspect -f '{{.State.ExitCode}}' "$1"
      return
    fi
    sleep 1
  done
}
fail() {
  echo "::error::$*"
  exit 1
}
cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && docker inspect "$web" > /dev/null 2>&1; then
    echo "--- web container log"
    docker logs "$web" 2>&1 || true
  fi
  docker rm -f "$web" "$early" "$pg" > /dev/null 2>&1 || true
  docker network rm "$net" > /dev/null 2>&1 || true
  docker image rm "$image" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# Runs the image as a cluster would, with no entrypoint override; extra `docker run` flags come first.
run_web() {
  local name=$1
  shift
  docker run -d --name "$name" --network "$net" --user 1000:1000 --read-only --cap-drop ALL \
    --security-opt no-new-privileges -e HOST=0.0.0.0 -e BETTER_AUTH_SECRET=smoke-secret-0123456789abcdef0123456789 \
    -e BETTER_AUTH_URL=http://localhost:4321 "$@" "$image" > /dev/null
}

docker build -q -f "$dockerfile" -t "$image" web/ > /dev/null
user=$(docker image inspect -f '{{.Config.User}}' "$image")
[ "$user" = node ] || fail "the image runs as '$user', not node"

docker network create "$net" > /dev/null
docker run -d --name "$pg" --network "$net" -e POSTGRES_PASSWORD=admin-pw docker.io/library/postgres:18.3 > /dev/null
for _ in $(seq 60); do
  docker exec "$pg" pg_isready -U postgres -h 127.0.0.1 > /dev/null 2>&1 && break
  sleep 1
done
docker exec "$pg" psql -v ON_ERROR_STOP=1 -qU postgres \
  -c "create role app login password 'app-pw' nosuperuser nocreatedb nocreaterole" \
  -c "create database app owner app" > /dev/null

# A missing URI and a wrong password can't heal by waiting: both must fail at once, not after the 60 s retry window.
run_web "$early"
[ "$(exit_code_within "$early" 15)" = 1 ] || fail "with no APPDB_URI the container did not exit 1 within 15 s"
docker logs "$early" 2>&1 | grep 'APPDB_URI is not set' > /dev/null || fail "the missing-URI error does not name APPDB_URI"
docker rm -f "$early" > /dev/null
run_web "$early" -e APPDB_URI=postgresql://app:wrong@$pg:5432/app
[ "$(exit_code_within "$early" 15)" = 1 ] || fail "with a wrong password the container did not exit 1 within 15 s"
docker rm -f "$early" > /dev/null
# An SMTP_URL with no scheme would start, then throw on every auth request. It must stop the start, without its text.
run_web "$early" -e "APPDB_URI=$uri" -e SMTP_URL=user:smoke-smtp-pw@smtp.example.com
[ "$(exit_code_within "$early" 15)" = 1 ] || fail "with a scheme-less SMTP_URL the container did not exit 1 within 15 s"
docker logs "$early" 2>&1 | grep 'SMTP_URL is not an smtp' > /dev/null || fail "the bad-SMTP_URL error does not name SMTP_URL"
docker logs "$early" 2>&1 | grep smoke-smtp-pw > /dev/null && fail "the bad-SMTP_URL error prints the value"
docker rm -f "$early" > /dev/null

run_web "$web" -e "APPDB_URI=$uri" -p 127.0.0.1::4321
port=$(docker port "$web" 4321/tcp | head -1)
ok=
for _ in $(seq 90); do
  ok=$(curl -fsS "http://$port/api/auth/ok" 2> /dev/null) && break
  [ "$(docker inspect -f '{{.State.Running}}' "$web")" = true ] || fail "the web container exited"
  sleep 1
done
[ "$ok" = '{"ok":true}' ] || fail "/api/auth/ok answered '$ok', not {\"ok\":true}"

migrations=$(docker exec "$pg" psql -tAU postgres -d app -c 'select count(*) from drizzle.__drizzle_migrations' || true)
[ "$migrations" -gt 0 ] || fail "no migrations were applied"
uid=$(docker exec "$web" id -u)
[ "$uid" = 1000 ] || fail "the server runs as UID $uid, not 1000"

docker stop "$web" > /dev/null
code=$(docker inspect -f '{{.State.ExitCode}}' "$web")
[ "$code" = 0 ] || fail "docker stop on the serving container exited $code, not 0"

# Before the server is up, node is PID 1 with only start.mjs's handlers: a stop during migrate.mjs's wait for
# Postgres (here a port nothing listens on) must exit at once, not wait out Docker's 10 s and be killed (137).
run_web "$early" -e APPDB_URI=postgresql://app:app-pw@$pg:5433/app
for _ in $(seq 30); do
  docker logs "$early" 2>&1 | grep 'database not ready' > /dev/null && break
  sleep 1
done
docker logs "$early" 2>&1 | grep 'database not ready' > /dev/null || fail "the container never reached migrate.mjs's retry loop"
SECONDS=0
docker stop "$early" > /dev/null
code=$(docker inspect -f '{{.State.ExitCode}}' "$early")
if [ "$code" = 0 ] || [ "$code" = 137 ] || [ "$SECONDS" -gt 5 ]; then
  fail "docker stop during the database wait exited $code after ${SECONDS}s (want non-zero, not 137, within 5 s)"
fi

echo "smoke-image: ok ($migrations migrations, UID $uid, serving stop exit 0, early stop exit $code)"
