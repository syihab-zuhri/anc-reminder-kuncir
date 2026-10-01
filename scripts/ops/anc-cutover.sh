#!/bin/bash
# One-shot cutover of the ANC app to the pre-built staging directory, with automatic rollback.
# Runs on the SERVER (copy it there, review it, then run it detached so a dropped SSH session
# cannot leave a half-finished swap):
#
#   scp scripts/ops/anc-cutover.sh vps-claude:/root/anc-cutover.sh
#   ssh vps-claude 'chmod 700 /root/anc-cutover.sh && setsid nohup /root/anc-cutover.sh >/dev/null 2>&1 &'
#   ssh vps-claude 'tail -f /root/anc-cutover-*.log'
#
# Preconditions (already prepared on the server):
#   /www/wwwroot/posyandukkn26.my.id.next   built tree (npm ci + builds done) with its own .env
#   database migrated to 000020 (additive; the old code ignores the new table)
#   backups in /root/backups/anc-pre-deploy-*
#
# What it does: trial-starts the staged API on :3101 -> stops the three services -> swaps the
# directories (old tree kept as *.prev-<timestamp>) -> moves credential files out of the web root
# into /root/anc-moved-secrets-<timestamp> -> runs API and worker as www instead of root ->
# starts worker, api, web -> verifies health. Any failed step restores the previous tree.
set -u
TS=$(date +%Y%m%d-%H%M%S)
LOG=/root/anc-cutover-$TS.log
exec >>"$LOG" 2>&1
LIVE=/www/wwwroot/posyandukkn26.my.id
NEW=${LIVE}.next
PREV=${LIVE}.prev-$TS
SECRETS=/root/anc-moved-secrets-$TS
MOVED_SECRETS="info.txt login-info.txt .env.bak.20260918_175205"
say() { echo "[$(date +%T)] $*"; }
swapped=0

wait_http() { # url, seconds
  local url=$1 limit=$2 t=0
  while [ $t -lt $limit ]; do
    [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url")" = "200" ] && return 0
    sleep 3; t=$((t+3))
  done
  return 1
}

rollback() {
  say "ROLLBACK: $1"
  systemctl stop anc-web anc-api anc-worker
  if [ "$swapped" = 1 ] && [ -d "$PREV" ]; then
    [ -d "$LIVE" ] && mv "$LIVE" "${LIVE}.failed-$TS"
    mv "$PREV" "$LIVE"
  fi
  for f in $MOVED_SECRETS; do [ -e "$SECRETS/$f" ] && mv "$SECRETS/$f" "$LIVE/$f"; done
  rm -f /etc/systemd/system/anc-api.service.d/zz-hardening.conf /etc/systemd/system/anc-worker.service.d/zz-hardening.conf
  systemctl daemon-reload
  systemctl start anc-worker; systemctl start anc-api; systemctl start anc-web
  if wait_http http://127.0.0.1:3001/api/v1/health/ready 180; then say "rollback complete, old version is serving"; else say "ROLLBACK COULD NOT CONFIRM HEALTH - inspect manually"; fi
  exit 1
}

say "cutover start (log: $LOG)"
for p in "$NEW/apps/api/dist/main.js" "$NEW/apps/worker/dist/main.js" "$NEW/apps/web/.next/BUILD_ID" "$NEW/.env" "$NEW/node_modules/next/package.json"; do
  [ -e "$p" ] || { say "ABORT: missing $p (nothing changed)"; exit 2; }
done

say "trial: starting the staged API on 127.0.0.1:3101 against the real database"
( cd "$NEW" && API_PORT=3101 API_HOST=127.0.0.1 exec node --env-file=.env apps/api/dist/main.js ) >/tmp/anc-trial-api.log 2>&1 &
TRIAL=$!
if wait_http http://127.0.0.1:3101/api/v1/health/ready 180; then say "trial API ready"; else kill $TRIAL 2>/dev/null; say "ABORT: staged API did not become ready (nothing changed). last log lines:"; tail -5 /tmp/anc-trial-api.log | cut -c1-200; exit 3; fi
grep -q fcm_not_configured /tmp/anc-trial-api.log && say "note: staged API logged fcm_not_configured"
kill $TRIAL 2>/dev/null; wait $TRIAL 2>/dev/null; rm -f /tmp/anc-trial-api.log

say "carrying server-only files into the new tree (hard links, nothing removed from the live tree)"
for f in .htaccess .user.ini .well-known .snapshots 404.html 502.html; do [ -e "$LIVE/$f" ] && cp -al "$LIVE/$f" "$NEW/$f"; done

say "stopping services"
systemctl stop anc-web anc-api anc-worker || rollback "could not stop services"

say "swapping directories"
mv "$LIVE" "$PREV" || rollback "mv live->prev failed"
swapped=1
mv "$NEW" "$LIVE" || rollback "mv new->live failed"

say "moving credential files out of the web root to $SECRETS (root-only)"
mkdir -p "$SECRETS" && chmod 700 "$SECRETS"
for f in $MOVED_SECRETS; do [ -e "$PREV/$f" ] && mv "$PREV/$f" "$SECRETS/$f"; done

say "least privilege: API and worker run as www (were root), no new privileges, private /tmp"
for u in anc-api anc-worker; do
  mkdir -p /etc/systemd/system/$u.service.d
  printf '[Service]\nUser=www\nGroup=www\nNoNewPrivileges=yes\nPrivateTmp=yes\n' > /etc/systemd/system/$u.service.d/zz-hardening.conf
done
systemctl daemon-reload

START=$(date '+%F %T')
say "starting worker, api, web"
systemctl start anc-worker || rollback "worker failed to start"
systemctl start anc-api || rollback "api failed to start"
systemctl start anc-web || rollback "web failed to start"

say "verifying"
wait_http http://127.0.0.1:3001/api/v1/health/ready 240 || rollback "API not ready"
wait_http http://127.0.0.1:3000/ 240 || rollback "web not serving"
for u in anc-api anc-web anc-worker; do systemctl is-active --quiet $u || rollback "$u is not active"; done
sleep 20
for u in anc-api anc-web anc-worker; do systemctl is-active --quiet $u || rollback "$u died after start"; done
fatal=$(journalctl -u anc-api -u anc-worker --since "$START" --no-pager -o cat | grep -c '"level":"fatal"')
[ "$fatal" = 0 ] || rollback "fatal log lines after start: $fatal"

say "SUCCESS. previous tree kept at $PREV (rollback source). moved credential files are in $SECRETS"
echo "$PREV" > /root/backups/LATEST_PREV_TREE
exit 0
