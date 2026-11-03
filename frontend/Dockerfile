# Multi-stage production Dockerfile for RN CRM Frontend (Next.js)
FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# Install devDependencies for build (Tailwind, PostCSS)
RUN npm ci --include=dev

COPY . .

# Environment variable for Next.js build
ARG NEXT_PUBLIC_API_URL=https://crm-api.rnvalves.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npx next build

# Runner stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js 2>/dev/null || true

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000"]
