# atlassian-notes in a container. See "Run with Docker" in README.md; compose.yaml mounts your config and notes.
# No secrets or notes are baked in: .dockerignore keeps .env files out, and both folders are mounted at run time.

FROM node:26-slim AS build
WORKDIR /app
# The packed zip ships a lockfile; inside the tools monorepo the lockfile is at the repo root, so fall back to install.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    OPEN_BROWSER=false
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/examples ./examples
COPY --from=build /app/public ./public
COPY --from=build /app/.env.example ./
USER node
EXPOSE 4317
CMD ["node", "src/server/main.ts"]
