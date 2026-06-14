#!/usr/bin/env bash
# Mac-side setup for the "public relay to a local Mac opencode" architecture.
#
# Installs frpc via Homebrew, writes its config (dialing out to the relay
# server), and registers a launchd agent so the tunnel auto-starts on login and
# restarts on crash. opencode itself is assumed to already be running locally
# (the desktop app starts it on 127.0.0.1:5001).
#
# Usage:
#   RELAY_IP=1.2.3.4 FRP_TOKEN=... ./deploy-mac.sh
#   (interactive if those vars are unset)

set -euo pipefail

prompt() {
  local var="$1" question="$2" default="${3:-}"
  local current; eval "current=\${$var:-}"
  [[ -n "$current" ]] && { echo "$question [$current]"; return; }
  read -r -p "$question [$default]: " answer
  eval "$var=\"\${answer:-$default}\""
}

RELAY_IP="${RELAY_IP:-}"
FRP_TOKEN="${FRP_TOKEN:-}"
FRPS_PORT="${FRPS_PORT:-7000}"
TUNNEL_PORT="${TUNNEL_PORT:-6001}"   # remote port the Mac claims on the server
LOCAL_PORT="${LOCAL_PORT:-5001}"     # local opencode sidecar port

prompt RELAY_IP "Relay server public IP / domain" ""
prompt FRP_TOKEN "frp token (must match the server's frps.toml)" ""

# --- install frpc ----------------------------------------------------------
if ! command -v frpc >/dev/null; then
    if ! command -v brew >/dev/null; then
        echo "Install Homebrew first: https://brew.sh" >&2; exit 1
    fi
    brew install frpc
fi
FRPC_BIN="$(command -v frpc)"
echo "frpc: $FRPC_BIN ($($FRPC_BIN --version))"

# --- config ----------------------------------------------------------------
CONF_DIR="$(dirname "$FRPC_BIN")/../etc/frp"; CONF_DIR="$(cd "$CONF_DIR" && pwd)/frp"
mkdir -p "$CONF_DIR"
umask 077
cat > "$CONF_DIR/frpc.toml" <<EOF
serverAddr = "${RELAY_IP}"
serverPort = ${FRPS_PORT}
auth.token = "${FRP_TOKEN}"
transport.heartbeatInterval = 30
transport.heartbeatTimeout = 90

[[proxies]]
name = "opencode"
type = "tcp"
remotePort = ${TUNNEL_PORT}
localIP = "127.0.0.1"
localPort = ${LOCAL_PORT}
EOF
chmod 600 "$CONF_DIR/frpc.toml"
echo "wrote $CONF_DIR/frpc.toml"

# --- launchd agent ---------------------------------------------------------
PLIST="$HOME/Library/LaunchAgents/ai.opencode.frpc.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>ai.opencode.frpc</string>
    <key>ProgramArguments</key>
    <array>
        <string>${FRPC_BIN}</string>
        <string>-c</string>
        <string>${CONF_DIR}/frpc.toml</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key><string>/tmp/opencode-frpc.log</string>
    <key>StandardErrorPath</key><string>/tmp/opencode-frpc.log</string>
    <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 3
echo "=== status ==="
launchctl list | grep opencode.frpc || echo "(failed to load)"
tail -4 /tmp/opencode-frpc.log 2>/dev/null

cat <<EOF

Done. The tunnel starts on login and auto-restarts.

Connect from the phone (HTTPS on, host = relay domain, port 443,
password = the opencode sidecar password, default "opencode").
EOF
