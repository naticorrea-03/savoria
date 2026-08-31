FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node . .

EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 2567) + '/health').then(async (response) => { if (!response.ok || !(await response.json()).ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["npm", "start"]
