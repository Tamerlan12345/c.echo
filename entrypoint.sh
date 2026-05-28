#!/bin/sh
# Substitute environment variables from template into /tmp/livekit.yaml safely
envsubst '$LIVEKIT_TCP_PORT $LIVEKIT_NODE_IP $EXTERNAL_TURN_USERNAME $EXTERNAL_TURN_CREDENTIAL $LIVEKIT_API_KEY $LIVEKIT_API_SECRET $REDIS_ADDRESS $REDIS_PASSWORD' < /etc/livekit.yaml.template > /tmp/livekit.yaml

# Restrict permissions of the generated file for security
chmod 600 /tmp/livekit.yaml

# Execute the livekit-server with the generated configuration
exec /livekit-server --config /tmp/livekit.yaml
