#!/bin/sh
missing=0
for var in LIVEKIT_TCP_PORT LIVEKIT_NODE_IP RAILWAY_PROXY_TARGET_PORT LIVEKIT_API_KEY LIVEKIT_API_SECRET REDIS_ADDRESS EXTERNAL_TURN_USERNAME EXTERNAL_TURN_CREDENTIAL; do
    eval "value=\${$var:-}"
    if [ -z "$value" ]; then
        echo "[entrypoint] missing required env: $var" >&2
        missing=1
    fi
done

if [ "$missing" -eq 1 ]; then
    exit 1
fi

export REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Bridge Railway's target port → LiveKit's advertised TCP port.
# Railway TCP Proxy assigns a random external port but forwards to RAILWAY_PROXY_TARGET_PORT.
# LiveKit must listen on LIVEKIT_TCP_PORT (= external port) to match its ICE candidates.
if [ "$RAILWAY_PROXY_TARGET_PORT" != "$LIVEKIT_TCP_PORT" ]; then
    socat -d -d TCP-LISTEN:${RAILWAY_PROXY_TARGET_PORT},fork,reuseaddr TCP:127.0.0.1:${LIVEKIT_TCP_PORT} &
    SOCAT_PID=$!
    echo "[entrypoint] socat bridge started: pid=$SOCAT_PID ports=${RAILWAY_PROXY_TARGET_PORT}->${LIVEKIT_TCP_PORT}" >&2
else
    echo "[entrypoint] socat skipped: target=${RAILWAY_PROXY_TARGET_PORT} == livekit=${LIVEKIT_TCP_PORT}" >&2
fi

envsubst '$LIVEKIT_TCP_PORT $LIVEKIT_NODE_IP $EXTERNAL_TURN_USERNAME $EXTERNAL_TURN_CREDENTIAL $LIVEKIT_API_KEY $LIVEKIT_API_SECRET $REDIS_ADDRESS $REDIS_PASSWORD' < /etc/livekit.yaml.template > /tmp/livekit.yaml

chmod 600 /tmp/livekit.yaml

exec /livekit-server --config /tmp/livekit.yaml
