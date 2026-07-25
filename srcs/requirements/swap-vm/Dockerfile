# swap-vm — Solidity/Foundry build + test + deploy harness
# (1inch SwapVM fork + custom opcodes _inventorySkew2D / _oracleGuard2D)
#
# This is a PLACEHOLDER Dockerfile (build kickoff Fri Jul 24). The image is a
# Foundry toolchain the team shells into to forge build/test/deploy; the
# contracts are not a long-running service. Tune the base tag + workdir during
# the build. See docs/strategy/10-10-PLAYBOOK.md Move #2 (tests) + Move #5.
FROM ghcr.io/foundry-rs/foundry:latest AS foundry

# forge/cast/anvil land in /usr/local/bin in the foundry image.
WORKDIR /workspace

# Copy the project (node_modules is .dockerignored — install in the container).
COPY . /workspace

# Install npm deps (remappings point at node_modules; see remappings.txt).
RUN apk add --no-cache nodejs npm || true
RUN npm install --ignore-scripts

# Default: drop into a shell for forge build/test/deploy. Override via compose
# command: e.g. `command: ["forge","test","-vvv"]`.
CMD ["sh", "-c", "forge build && echo 'swap-vm ready — forge test / forge script ...' && sleep infinity"]
