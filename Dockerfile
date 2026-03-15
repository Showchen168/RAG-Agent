# ---- Stage 1: 安裝依賴 ----
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- Stage 2: 建構 ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 建構時注入環境變數（Next.js 需要 NEXT_PUBLIC_ 變數在建構時可用）
# 必須透過 docker build --build-arg 傳入，否則客戶端 JS 會烘焙為空字串
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NODE_OPTIONS="--max_old_space_size=4096"

RUN pnpm run build

# ---- Stage 3: 執行 ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 複製 standalone 輸出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 安裝 Chromium 供 Canvas PDF 導出使用（Alpine 無瀏覽器 binary，Playwright 需要系統 Chromium）
# font-noto-cjk 提供中文/日文/韓文字型，避免 PDF 出現豆腐字（方塊）
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# 建立技能輸出目錄並賦予 nextjs 使用者權限
RUN mkdir -p /data/skills-output && chown -R nextjs:nodejs /data/skills-output

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
