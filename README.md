# Socmed Microservice Example (Updated)

## Services

- MySQL (single DB `socmed_app` untuk semua service)
- API Gateway (port 4000)
- Auth Service (port 4001, internal)
- Post Service (port 4002, internal)
- Comment Service (port 4003, internal)
- Like Service (port 4004, internal)
- Media Service (port 4005, internal, file upload)
- Frontend React (Vite, port 5173)

## Cara jalanin di lokal (Docker)

1. Pastikan sudah install Docker & Docker Compose.

2. Jalankan backend:

```bash
cd socmed-microservice
docker compose up --build
```

Ini akan menjalankan:

- MySQL di port host `3307`
- API Gateway di `http://localhost:4000`
- Auth/Post/Comment/Like/Media service di jaringan internal Docker

MySQL pakai:

- host: `mysql` (dari docker-compose, untuk antar container)
- port: `3306`
- user: `root`
- password: `rootpassword`
- database: `socmed_app`

3. Jalankan frontend:

```bash
cd frontend
cp .env.example .env   # opsional, kalau mau override
npm install
npm run dev
```

Frontend akan jalan di: `http://localhost:5173`

4. Flow test:

- Register user baru via UI (switch ke Register).
- Login dengan email/username + password.
- Buat posting (bisa dengan upload gambar).
- List post akan tampil di halaman utama.

## File .env

Untuk Docker Compose, environment sudah di-set di `docker-compose.yml`, jadi **tidak wajib** bikin `.env` lagi untuk jalanin dengan Docker.

Namun disertakan `.env.example` untuk kasus jika service dijalankan langsung (tanpa Docker) atau untuk konfigurasi lanjutan:

- `gateway/.env.example`
- `services/auth-service/.env.example`
- `services/post-service/.env.example`
- `services/comment-service/.env.example`
- `services/like-service/.env.example`
- `services/media-service/.env.example`
- `frontend/.env.example`

Cara pakai jika ingin run satu service manual (contoh auth-service):

```bash
cd services/auth-service
cp .env.example .env
# edit .env jika perlu
npm install
node src/index.js
```

## Catatan

- Schema tabel akan otomatis dibuat saat masing-masing service pertama kali start.
- Retry logic sudah ditambahkan di semua service yang akses DB, jadi kalau MySQL sedikit lambat start, service akan mencoba beberapa kali sebelum menyerah.
