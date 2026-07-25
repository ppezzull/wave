# compiler — deterministic TS compiler (NL → AST → IR → SwapVM bytecode)
# PLACEHOLDER (build kickoff Fri Jul 24). Owns Move #1 (reject-and-rewrite pass):
# docs/strategy/10-10-PLAYBOOK.md. Exposes POST /compile + /simulate.
FROM node:20-alpine

WORKDIR /app

# Real package.json lands here during the build (P2, h8–10).
# COPY package*.json ./
# RUN npm ci

# COPY . .

# Placeholder so the image builds today:
RUN echo '{"name":"strategy-compiler","private":true}' > package.json

EXPOSE 3001
CMD ["echo", "compiler placeholder — wire the TS pipeline (Move #1) during the build"]
