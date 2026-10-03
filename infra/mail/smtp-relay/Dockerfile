FROM node:22-alpine
WORKDIR /app
# The lockfile is COPYed and `npm ci` is used so the image gets the versions the
# lockfile pins. With `npm install` off package.json alone the build re-resolved
# `^3.19.x` every time, so the lockfile was decorative — the only thing it fed was
# Dependabot, which is how a nodemailer advisory sat open against a version the
# image had already moved past.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.mjs ./
USER node
CMD ["node", "index.mjs"]
