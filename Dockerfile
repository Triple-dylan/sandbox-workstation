# Sandbox Workstation as one container: the built client and the server that serves it.
# Built from the repository root (Railway's default).
FROM node:22-slim AS build
WORKDIR /app
COPY workstation/package.json workstation/package-lock.json ./
RUN npm ci
COPY workstation/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
# Hosted copies are by invitation. PORT is set by the host; 8080 is only the fallback.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 SIGN_IN=invite WORKSTATION_DB=/data/workstation.db
COPY workstation/package.json workstation/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY workstation/server ./server
COPY workstation/shared ./shared
RUN mkdir -p /data
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
