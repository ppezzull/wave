# subgraph — first-party Graph subgraph indexing SwapVM Swapped events
# PLACEHOLDER (build kickoff Fri Jul 24). Owns the Graph half of Move #5.
# Replaces the Messari dependency; retune trigger consumes its deltas.
#
# NOTE: a real graph-node needs ipfs + postgres as siblings (see docker-compose
# depends_on). The schema.graphql + mapping.ts land here during the build.
FROM node:20-alpine

RUN apk add --no-cache git

# graph-cli for `graph codegen` / `graph build` / `graph deploy`:
# RUN npm install -g @graphprotocol/graph-cli

WORKDIR /subgraph

# Placeholder so the image builds today:
RUN echo '{}' > package.json

CMD ["echo", "subgraph placeholder — add schema.graphql + mapping.ts (Move #5) during the build"]
