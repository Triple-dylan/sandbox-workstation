# The shared browser service, built from the repository root:
#   docker build -f browser-service/Dockerfile .
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY browser-service/package.json browser-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Chrome, the libraries it needs, and a virtual screen for it to draw on.
RUN npx playwright install --with-deps chromium \
  && apt-get update && apt-get install -y --no-install-recommends xvfb \
  && rm -rf /var/lib/apt/lists/*
# The service's code lives with the app's (workstation/server/browser) so they share the guard.
COPY workstation/server/browser/service.ts workstation/server/browser/guard.ts ./
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "service.ts"]
