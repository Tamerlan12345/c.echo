# LiveKit Config

Validate and update LiveKit configuration for Centras Echo on Railway.

You are a LiveKit configuration assistant for this project at `d:\Проекты\c.echo`.

## What to do

### 1 — Read current config files

Read these files:
- `d:\Проекты\c.echo\livekit.yaml` — config template (uses `${VAR}` substitution)
- `d:\Проекты\c.echo\entrypoint.sh` — startup script, sets default env values
- `d:\Проекты\c.echo\Dockerfile.livekit` — LiveKit Docker image definition

### 2 — Validate livekit.yaml

Check each section against Railway deployment requirements:

**Port**
- `port` should be `8080` (Railway routes HTTP/WebSocket here)

**RTC section**
- `tcp_port` must be `${LIVEKIT_TCP_PORT}` — templated, not hardcoded
- `node_ip` must be `"${LIVEKIT_NODE_IP}"` — templated, not hardcoded
- `use_external_ip` must be `false` — Railway container egress IP ≠ proxy edge IP
- `port_range_start` / `port_range_end` defines UDP range — keep minimal (e.g. 50000–50010) since Railway blocks UDP ingress anyway

**TURN servers**
- Must have NO `protocol: "udp"` entries — Railway blocks UDP ingress entirely
- Must have at least one `protocol: "tls"` entry on port 443
- May also have `protocol: "tcp"` on port 80 as fallback
- All entries must use `${EXTERNAL_TURN_USERNAME}` and `${EXTERNAL_TURN_CREDENTIAL}` templates

**Keys**
- Must be `"${LIVEKIT_API_KEY}": "${LIVEKIT_API_SECRET}"` — both templated

**Redis**
- Must have `address: "${REDIS_ADDRESS}"` and `password: "${REDIS_PASSWORD}"` templated
- Redis is REQUIRED — LiveKit will fail to start without it

**Room limits**
- `max_participants` should match the API constant `MAX_PARTICIPANTS_PER_MEETING` (currently 7)
- `empty_timeout` should be ≥ 300 seconds

### 3 — Validate entrypoint.sh

Check:
- `LIVEKIT_TCP_PORT` default value — must equal the external TCP port Railway assigned
- `LIVEKIT_NODE_IP` default value — must be the resolved IP of the Railway TCP proxy hostname
- `RAILWAY_PROXY_TARGET_PORT` default value — must equal the internal port Railway delivers traffic to
- `envsubst` call must list ALL variables used in livekit.yaml as `'$VAR1 $VAR2 ...'`
- socat command must bridge `RAILWAY_PROXY_TARGET_PORT` → `LIVEKIT_TCP_PORT` on localhost

### 4 — Validate Dockerfile.livekit

Check:
- Based on `livekit/livekit-server:latest`
- Installs `gettext` (for `envsubst`) and `socat`
- Copies `livekit.yaml` to `/etc/livekit.yaml.template`
- Copies `entrypoint.sh`, sets executable bit
- Ensures Unix line endings (e.g. `sed -i 's/\r//'`)

### 5 — Report findings

Print a table:

| Config Item | Current Value | Status | Required Fix |
|-------------|---------------|--------|--------------|

Then print the **Railway Env Vars checklist** — variables that MUST be set in Railway dashboard for LiveKit to work:

```
Required in Railway dashboard (LiveKit service):
  LIVEKIT_API_KEY          = <choose a short key, e.g. centras_key>
  LIVEKIT_API_SECRET       = <random 32+ char string>
  LIVEKIT_TCP_PORT         = <external TCP port from Railway dashboard>
  LIVEKIT_NODE_IP          = <IP from: nslookup <proxy>.proxy.rlwy.net>
  RAILWAY_PROXY_TARGET_PORT= <internal port Railway delivers to container>
  REDIS_ADDRESS            = <host:port of Redis service>
  REDIS_PASSWORD           = <Redis password or empty>
  EXTERNAL_TURN_USERNAME   = <Metered.ca TURN username>
  EXTERNAL_TURN_CREDENTIAL = <Metered.ca TURN credential>

Required in Railway dashboard (API service):
  LIVEKIT_URL              = ws://livekit.railway.internal:8080  (internal)
  PUBLIC_LIVEKIT_URL       = wss://<your-livekit-domain>         (public)
  LIVEKIT_API_KEY          = <same as LiveKit service>
  LIVEKIT_API_SECRET       = <same as LiveKit service>
```

### 6 — Apply fixes (if $ARGUMENTS contains "fix")

If the user passed `fix` as an argument, apply all config corrections to `livekit.yaml` and `entrypoint.sh` directly.
Otherwise, only report issues without modifying files.

**Arguments:** $ARGUMENTS
