# LiveKit Debug

Diagnose LiveKit connectivity issues for Centras Echo on Railway.

You are debugging the LiveKit media server. The project is at `d:\Проекты\c.echo`.

## Architecture reminder

```
Client browser
  ↓ WebSocket signaling
LiveKit server (Railway TCP Proxy → socat bridge → LiveKit port 8080)
  ↓ ICE-TCP media
Client browser (via LIVEKIT_NODE_IP:LIVEKIT_TCP_PORT)
```

Railway blocks all UDP ingress. ICE-TCP is the only direct path. TURN TLS/443 is the fallback relay.

## Checks to run

### Step 1 — Environment variables

Read `.env` or `.env.local` if present, OR ask the user to provide values.
Check that ALL of these are set and non-empty:
- `LIVEKIT_URL` — internal WebSocket URL (e.g. `ws://livekit.railway.internal:8080`)
- `PUBLIC_LIVEKIT_URL` — public WebSocket URL (e.g. `wss://livekit.centras-echo.railway.app`)
- `LIVEKIT_API_KEY` — API key (≥8 chars)
- `LIVEKIT_API_SECRET` — API secret (≥32 chars)
- `LIVEKIT_TCP_PORT` — must match the **external** port Railway assigned for TCP Proxy
- `LIVEKIT_NODE_IP` — must be the **public IP** of Railway's TCP proxy edge (not container IP)
- `RAILWAY_PROXY_TARGET_PORT` — the internal port Railway delivers traffic to (socat listens here)
- `REDIS_ADDRESS` — Redis host:port for LiveKit state coordination
- `REDIS_PASSWORD` — Redis password (can be empty string if no auth)
- `EXTERNAL_TURN_USERNAME` — Metered.ca TURN username
- `EXTERNAL_TURN_CREDENTIAL` — Metered.ca TURN credential

Flag any missing or suspicious values.

### Step 2 — Resolve LIVEKIT_NODE_IP

Run DNS lookup for the Railway TCP proxy hostname:
```powershell
nslookup <proxy-hostname>.proxy.rlwy.net 8.8.8.8
```
The resolved IP must match `LIVEKIT_NODE_IP`. If they differ, the ICE candidate will point to the wrong host and TCP media connections will fail.

### Step 3 — Test LiveKit HTTP API reachability

Try to reach LiveKit's HTTP API (it listens on port 8080, same as WebSocket):
```powershell
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
```
Or from outside:
```powershell
curl -s -o /dev/null -w "%{http_code}" https://<PUBLIC_LIVEKIT_HOST>/
```
Expected: any 2xx or 4xx (not connection refused/timeout). Connection refused means LiveKit is not running.

### Step 4 — Test LiveKit SDK connection from API

Check if the API can reach LiveKit to list rooms. Run:
```powershell
cd d:\Проекты\c.echo
node --input-type=module << 'EOF'
import { RoomServiceClient } from 'livekit-server-sdk'
const client = new RoomServiceClient(
  process.env.LIVEKIT_URL || 'ws://localhost:7880',
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
)
const rooms = await client.listRooms()
console.log('Rooms:', rooms.length)
EOF
```
If this fails, the API cannot reach LiveKit. Check `LIVEKIT_URL` and whether LiveKit is running.

### Step 5 — Check socat bridge

Verify the bridge is configured correctly by examining entrypoint.sh:
- `LIVEKIT_TCP_PORT` must equal the external Railway port clients connect to
- `RAILWAY_PROXY_TARGET_PORT` must equal the internal port Railway delivers to the container
- These two should differ — if equal, socat is skipped and LiveKit must listen directly on that port

### Step 6 — Check livekit.yaml

Read `d:\Проекты\c.echo\livekit.yaml` and verify:
- `port: 8080` (or matches WebSocket URL port)
- `rtc.tcp_port` uses `${LIVEKIT_TCP_PORT}` template
- `rtc.node_ip` uses `${LIVEKIT_NODE_IP}` template
- `rtc.use_external_ip: false` (required on Railway — auto-detect gets container egress IP, not proxy IP)
- `rtc.turn_servers` has only TLS/TCP entries (no UDP — Railway blocks UDP ingress)
- `redis.address` uses `${REDIS_ADDRESS}` template

### Step 7 — Check Docker setup

Read `d:\Проекты\c.echo\Dockerfile.livekit` and verify:
- `gettext` package is installed (required for `envsubst`)
- `socat` package is installed
- entrypoint.sh has Unix line endings (not Windows CRLF)

### Step 8 — Common failure patterns

Print a summary of findings and map each issue to a fix:

| Issue | Symptom | Fix |
|-------|---------|-----|
| Wrong LIVEKIT_NODE_IP | Clients get "ICE failed" | Run nslookup on Railway proxy, set LIVEKIT_NODE_IP to resolved IP |
| Wrong LIVEKIT_TCP_PORT | Connections time out | Set LIVEKIT_TCP_PORT to the external port shown in Railway dashboard |
| Redis missing | LiveKit fails to start | Set REDIS_ADDRESS and REDIS_PASSWORD env vars |
| UDP TURN in config | Slow ICE / connection takes >10s | Remove UDP TURN entries from livekit.yaml, keep only TLS/TCP |
| LIVEKIT_URL uses public URL | API SDK calls are slow/fail | Set LIVEKIT_URL to internal Railway URL (*.railway.internal) |
| PUBLIC_LIVEKIT_URL missing | Clients get wrong serverUrl | Set PUBLIC_LIVEKIT_URL to the public wss:// URL |

**Arguments:** $ARGUMENTS
If an argument is provided (e.g. a hostname or URL), use it as the LiveKit public host for reachability tests.
