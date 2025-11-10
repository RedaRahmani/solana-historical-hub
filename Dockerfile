FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    SOLANA_RPC_URL=https://api.devnet.solana.com \
    USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
    REDIS_URL=redis://redis:6379

EXPOSE 3000

CMD ["npm", "start"]

