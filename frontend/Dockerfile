FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV VITE_API_URL=/api
RUN npm run build
EXPOSE 3000
CMD ["npm", "exec", "--", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
