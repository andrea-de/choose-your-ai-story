#!/usr/bin/env bash
# Joins a Claude Code cloud session to your tailnet as an ephemeral node, so a
# dev server started in the session is reachable at http://claude-dev:3000.
#
# Runs from the SessionStart hook in .claude/settings.json. Needs TS_AUTHKEY
# (a reusable, ephemeral, tagged Tailscale auth key) in the cloud environment's
# variables. Does nothing outside cloud sessions or without a key.
# Log: /tmp/tailnet.log
set -u

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
if [ -z "${TS_AUTHKEY:-}" ]; then
  echo "tailnet: TS_AUTHKEY is not set in this environment; skipping"
  exit 0
fi

SOCK=/tmp/ts.sock
TS="tailscale --socket=$SOCK"

if ! command -v tailscaled >/dev/null 2>&1; then
  echo "tailnet: installing tailscale"
  tmp=$(mktemp -d)
  if ! curl -fsSL https://pkgs.tailscale.com/stable/tailscale_latest_amd64.tgz | tar xz -C "$tmp"; then
    echo "tailnet: download failed"
    exit 0
  fi
  install -m 0755 "$tmp"/tailscale_*_amd64/tailscale "$tmp"/tailscale_*_amd64/tailscaled /usr/local/bin/
fi

if ! pgrep -x tailscaled >/dev/null; then
  # Userspace networking needs no TUN device; mem: state keeps nothing on disk.
  nohup tailscaled --tun=userspace-networking --state=mem: --socket="$SOCK" >/tmp/tailscaled.log 2>&1 &
fi

for _ in $(seq 1 40); do
  $TS status >/dev/null 2>&1 && break
  # Before login, status exits non-zero but the socket answers.
  [ -S "$SOCK" ] && break
  sleep 0.5
done

if $TS up --authkey="$TS_AUTHKEY" --hostname=claude-dev --timeout=90s; then
  echo "tailnet: connected as $($TS status --json 2>/dev/null | grep -o '"DNSName": *"[^"]*"' | head -1 | cut -d'"' -f4)"
else
  echo "tailnet: tailscale up failed; see /tmp/tailscaled.log"
fi
exit 0
