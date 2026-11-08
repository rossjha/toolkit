# atlassian-notes in a container. See "Run" in README.md; compose.yaml mounts your config and notes.
# No secrets or notes are baked in: Dockerfile.dockerignore keeps .env files out, and both folders are mounted at run time.
#
# Two ways to build, both through compose.yaml:
#   - In the tools monorepo, the build context is the repo root and APP=apps/atlassian-notes, so npm ci installs from
#     the root lockfile, with the root package.json's overrides (patched transitive deps, one React copy).
#   - From the packed zip, the context is this folder and APP=. ; the zip ships its own lockfile.

FROM node:26-slim AS build
ARG APP=.
WORKDIR /app
COPY package.json package-lock.json ./
COPY ${APP}/package.json ${APP}/
RUN if [ "$APP" = . ]; then npm ci; else npm ci -w "$APP"; fi
COPY ${APP} ${APP}
RUN cd "$APP" && npm run build
RUN npm prune --omit=dev

FROM node:26-slim
ARG APP=.
WORKDIR /app/${APP}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    OPEN_BROWSER=false
# The whole pruned tree: the root node_modules plus the app, including any app-level node_modules npm created.
COPY --from=build /app /app
USER node
EXPOSE 4317
CMD ["node", "src/server/main.ts"]
