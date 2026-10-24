# 只需要 api/ 和 plugin/lib/ —— 断行算法住在插件目录里，
# 因为浏览器扩展只能加载自己目录下的文件（见 cases/02）。
FROM node:20-alpine

WORKDIR /app

COPY api/package*.json ./api/
RUN cd api && npm install --omit=dev

COPY plugin/lib ./plugin/lib
COPY api ./api

ENV PORT=3000
EXPOSE 3000

# 不用 root 跑
USER node

CMD ["node", "api/server.js"]
