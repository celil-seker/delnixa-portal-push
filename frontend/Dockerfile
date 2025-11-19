# 1) Bağımlılıklar
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 2) Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# .env.local dahil tüm kaynaklar kopyalansın (NEXT_PUBLIC_API_URL builde girsin)
COPY . .
RUN npm run build

# 3) Runner
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Build çıktısını kopyala
COPY --from=builder /app ./
EXPOSE 3000
# Next.js prod server
CMD ["npm","run","start","--","-p","3000"]
