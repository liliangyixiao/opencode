# 手机端外网访问本地 opencode（公网中转架构）

opencode 始终在开发机的 Mac 上运行（桌面 app 的 sidecar，监听 `127.0.0.1:5001`）。
公网 VPS 只做**中转**：用 nginx 终止 TLS，用 frp 反向隧道把流量送回 Mac。
Mac 在 NAT 后面没有公网 IP，所以由 Mac 主动拨出到 VPS 建立隧道。

```
手机 ──HTTPS(443)──▶ VPS nginx ──▶ 127.0.0.1:6001 (frp proxy)
                                      │  frp 隧道（Mac 主动拨出）
                                      ▼
                                  Mac 127.0.0.1:5001 (opencode sidecar)
```

## 端口约定

| 位置 | 端口 | 用途 |
|---|---|---|
| VPS | 443 | nginx，TLS 入口（公网） |
| VPS | 7000 | frps 监听，Mac 的 frpc 连这里（需在云安全组放行） |
| VPS | 6001 | frp 代理端口，nginx 反代到这里（仅 loopback） |
| Mac | 5001 | opencode sidecar（桌面 app 启动） |

## 前置条件

- **VPS**：公网 Linux（Debian/Ubuntu/CentOS/Alpine），root，已装 nginx
- **域名**：A 记录指向 VPS 公网 IP（Let's Encrypt 必需）
- **云安全组**：放行 443（HTTPS）和 7000（frps）
- **Mac**：opencode 桌面 app 已运行（sidecar 监听 5001）；装好 Homebrew

## 部署

### 1. VPS 端（一次性）

```bash
scp -r packages/opencode/scripts/deploy root@<vps>:/tmp/
ssh root@<vps>
cd /tmp/deploy
sudo DOMAIN=opencode.example.com ./deploy-server.sh
# 记下输出的 FRP_TOKEN
```

脚本做的事：装 frps + certbot → 申请 Let's Encrypt 证书 → 写 nginx vhost（443 反代到 6001，关闭 buffering 支持 SSE）→ systemd 守护 frps。

### 2. Mac 端（一次性）

```bash
cd packages/opencode/scripts/deploy
RELAY_IP=<vps公网IP或域名> FRP_TOKEN=<和上面一致> ./deploy-mac.sh
```

脚本做的事：`brew install frpc` → 写 frpc.toml（拨到 VPS:7000，把 VPS 的 6001 映射到本地 5001）→ 装 launchd agent（开机自启 + 崩溃重启）。

验证：`curl -u opencode:opencode https://<域名>/global/health` 应返回 `{"healthy":true}`。

### 3. 手机端

连接页：打开 **HTTPS** → 地址填域名 → 端口 `443` → 密码填 opencode sidecar 密码（桌面 app 默认 `opencode`）。

## 运维

```bash
# Mac：查看/重启隧道
tail -f /tmp/opencode-frpc.log
launchctl kickstart -k gui/$(id -u)/ai.opencode.frpc

# VPS：查看 frps 状态 / 续期日志
systemctl status frps
systemctl status nginx
journalctl -u frps -f
certbot certificates
```

## 卸载

```bash
# Mac
launchctl unload ~/Library/LaunchAgents/ai.opencode.frpc.plist
rm ~/Library/LaunchAgents/ai.opencode.frpc.plist
brew uninstall frpc

# VPS
systemctl disable --now frps
rm -rf /opt/frp /etc/systemd/system/frps.service
rm /etc/nginx/sites-enabled/<域名> /etc/nginx/sites-available/<域名>
systemctl reload nginx
certbot delete --cert-name <域名>
```

## 安全说明

- opencode sidecar 只绑 loopback，公网无法直连 Mac
- frps 设了 `auth.token`，且 `allowPorts` 限定只能绑 6001
- frpc.toml / frps.toml 权限 600
- TLS 由 Let's Encrypt 提供，`certbot.timer` 自动续期
- **部署完成后请立即修改 VPS root 密码并启用 SSH 密钥登录**
