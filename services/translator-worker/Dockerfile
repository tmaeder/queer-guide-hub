# Translator worker. Node 24 runs the TypeScript sources directly (type
# stripping), so there is no build step.
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY glossary.json ./
COPY src ./src
USER node
ENV NODE_ENV=production NODE_NO_WARNINGS=1
CMD ["node", "src/main.ts"]
