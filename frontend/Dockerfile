FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN node -e "const raw=(process.env.VITE_API_BASE_URL||'').trim(); if(!raw){console.error('VITE_API_BASE_URL is required for production frontend builds.'); process.exit(1);} let url; try{url=new URL(raw);}catch{console.error('VITE_API_BASE_URL must be a valid absolute URL.'); process.exit(1);} if(new Set(['localhost','127.0.0.1','0.0.0.0','::1']).has(url.hostname)){console.error('VITE_API_BASE_URL cannot point to localhost for production frontend builds.'); process.exit(1);}"
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
