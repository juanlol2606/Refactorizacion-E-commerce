FROM node:24-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install
CMD [ "pnpm","run","start:dev" ]

FROM node:24-alpine AS dev-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:24-alpine AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS prod
EXPOSE 3000
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Las imágenes del seed y las subidas se sirven desde /app/static/products
COPY static ./static

CMD [ "node","dist/main.js"]
