FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Verify build output exists (Nest may emit dist/main.js or dist/src/main.js)
RUN ls -la dist && (test -f dist/main.js || test -f dist/src/main.js)

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

# Copy production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /data/photos /data/reports

# Do NOT switch to non-root before migrate (Prisma engines need write access on first run)
EXPOSE 4000

# Resolve main path for both possible Nest output layouts
CMD ["sh", "-c", "npx prisma migrate deploy && (node -e \"require('fs').accessSync(require('path').join('dist','main.js'))\" 2>/dev/null && node dist/main.js || node dist/src/main.js)"]
