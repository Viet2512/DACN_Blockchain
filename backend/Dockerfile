FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/ .
COPY chaincode/src/workflow.js /chaincode/src/workflow.js
EXPOSE 8080
CMD ["npm", "start"]
