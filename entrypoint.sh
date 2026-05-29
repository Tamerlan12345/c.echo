#!/bin/sh
# Set default values for essential port and IP variables if they are missing
export PORT="${PORT:-8080}"
export LIVEKIT_TCP_PORT="${LIVEKIT_TCP_PORT:-25037}"
export LIVEKIT_NODE_IP="${LIVEKIT_NODE_IP:-66.33.22.227}"

# Substitute environment variables from template into /tmp/livekit.yaml safely
envsubst '$PORT $LIVEKIT_TCP_PORT $LIVEKIT_NODE_IP $EXTERNAL_TURN_USERNAME $EXTERNAL_TURN_CREDENTIAL $LIVEKIT_API_KEY $LIVEKIT_API_SECRET $REDIS_ADDRESS $REDIS_PASSWORD' < /etc/livekit.yaml.template > /tmp/livekit.yaml

# Restrict permissions of the generated file for security
chmod 600 /tmp/livekit.yaml

# Execute the livekit-server with the generated configuration
exec /livekit-server --config /tmp/livekit.yaml
