#!/usr/bin/env bash
# Server-side setup for the "public relay to a local Mac opencode" architecture.
#
# Architecture:
#   phone --HTTPS(443)--> nginx --> 127.0.0.1:6001 (frp proxy port)
#                                        |
#                              frp tunnel (Mac dials out)
#                                        |
#                              Mac 127.0.0.1:5001 (opencode sidecar)
#
# This script installs frps + a TLS-terminating nginx vhost on the relay server.
# It does NOT run opencode here. The opencode server stays on the developer's Mac.
#
# Assumes:
#   - A Debian/Ubuntu relay with root access (adapts to dnf/apk too)
#   - nginx already installed and handling other sites (we only add a vhost)
#   - A domain A-record already pointing at this server's public IP
#
# Usage:
#   sudo DOMAIN=opencode.example.com FRP_TOKEN=... ./deploy-server.sh
#   (interactive if those vars are unset)

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

prompt() {
  local var="$1" question="$2" default="${3:-}"
  local current; eval "current=\${$var:-}"
  [[ -n "$current" ]] && { echo "$question [$current]" >&2; return; }
  if [[ -z "$default" && ! -t 0 ]]; then
    echo "ERROR: $var required." >&2; exit 1
  fi
  read -r -p "$question [$default]: " answer >&2
  eval "$var=\"\${answer:-$default}\""
}

DOMAIN="${DOMAIN:-}"
FRP_TOKEN="${FRP_TOKEN:-}"
TUNNEL_PORT="${TUNNEL_PORT:-6001}"   # nginx -> here; Mac maps this -> its 5001
FRPS_BIND_PORT="${FRPS_BIND_PORT:-7000}"  # Mac frpc connects here

prompt DOMAIN "Domain (A-record -> this server)" ""
prompt FRP_TOKEN "Shared secret for frp (any long random string)" "$(openssl rand -hex 24)"

# --- packages --------------------------------------------------------------
if command -v apt-get >/dev/null; then
    apt-get update -y
    apt-get install -y curl ca-certificates openssl nginx
    command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
elif command -v dnf >/dev/null; then
    dnf install -y curl ca-certificates openssl nginx certbot python3-certbot-nginx
elif command -v apk >/dev/null; then
    apk add --no-cache curl ca-certificates openssl nginx certbot
fi

# --- frps ------------------------------------------------------------------
FRP_VER=0.61.1
ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac
if [ ! -x /opt/frp/frps ] || /opt/frp/frps --version 2>/dev/null | grep -q "$FRP_VER"; then
    cd /tmp
    curl -fsSL -o frp.tgz "https://github.com/fatedier/frp/releases/download/v${FRP_VER}/frp_${FRP_VER}_linux_${ARCH}.tar.gz"
    tar xzf frp.tgz
    install -d /opt/frp
    cp "frp_${FRP_VER}_linux_${ARCH}/frps" /opt/frp/frps
    chmod +x /opt/frp/frps
fi

umask 077
cat > /opt/frp/frps.toml <<EOF
bindPort = ${FRPS_BIND_PORT}
auth.token = "${FRP_TOKEN}"
# Dashboard on loopback only.
webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "$(openssl rand -hex 12)"
# Least privilege: Mac may only bind the tunnel port.
allowPorts = [{ start = ${TUNNEL_PORT}, end = ${TUNNEL_PORT} }]
transport.heartbeatTimeout = 90
EOF
chmod 600 /opt/frp/frps.toml

cat > /etc/systemd/system/frps.service <<'EOF'
[Unit]
Description=frp server
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStart=/opt/frp/frps -c /opt/frp/frps.toml
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now frps

# Open the frps port in the cloud security group / local firewall.
echo ">>> Make sure your cloud security group allows inbound TCP ${FRPS_BIND_PORT}." >&2
if command -v ufw >/dev/null; then ufw allow ${FRPS_BIND_PORT}/tcp || true; fi
if command -v firewall-cmd >/dev/null; then
    firewall-cmd --permanent --add-port=${FRPS_BIND_PORT}/tcp || true
    firewall-cmd --reload || true
fi

# --- nginx vhost (HTTP first, so certbot can validate) --------------------
cat > /etc/nginx/sites-available/${DOMAIN} <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / { return 200 "ok"; add_header Content-Type text/plain; }
}
EOF
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
nginx -t && systemctl reload nginx

# --- certificate (certbot flips the vhost to 443) -------------------------
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect --keep-until-expiring

# --- rewrite the vhost to reverse-proxy the frp tunnel port ---------------
cat > /etc/nginx/sites-available/${DOMAIN} <<EOF
server {
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${TUNNEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # SSE / streaming: no buffering, long timeout
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
server {
    if (\$host = ${DOMAIN}) { return 301 https://\$host\$request_uri; } # managed by Certbot
    listen 80;
    server_name ${DOMAIN};
    return 404; # managed by Certbot
}
EOF
nginx -t && systemctl reload nginx

cat <<EOF

Done. Server-side relay is up.

Next, on the Mac, run deploy-mac.sh with:
  RELAY_DOMAIN=${DOMAIN}
  RELAY_IP=$(curl -s --max-time 5 ifconfig.me || echo '<server-public-ip>')
  FRP_TOKEN=<the same token you used here>
  FRPS_PORT=${FRPS_BIND_PORT}
  TUNNEL_PORT=${TUNNEL_PORT}
EOF
