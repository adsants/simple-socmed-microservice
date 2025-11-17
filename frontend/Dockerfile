FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

# Kode tidak di-copy di sini, karena kita pakai volume ./frontend:/app
# COPY . .   <-- bisa dihapus untuk mode dev

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
