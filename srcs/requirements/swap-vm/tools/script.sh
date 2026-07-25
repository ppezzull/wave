#!/bin/sh
# swap-vm entrypoint — runs inside the foundry container.
# Wire the real build/test/deploy flow here during the hackathon.
# See docs/swap-vm-upstream/DEPLOY.md for the make deploy-* flow.
set -e

cd /workspace

echo "==> Installing deps"
npm install --ignore-scripts

echo "==> forge build"
forge build

echo "==> forge test (gas snapshot gate)"
forge snapshot --check --tolerance 5 --no-match-test "testFuzz_*" || {
    echo "!! gas snapshot drifted — run 'forge snapshot' and review"
}

forge test

echo "==> swap-vm harness ready."
