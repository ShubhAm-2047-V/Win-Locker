# 🚀 Vercel Cloud Storage Server & Visualizer Dashboard

A fast, lightweight Node.js Serverless storage manager and REST API built for **100% Free Deployment on Vercel** using **Vercel Blob Storage** (1 GB Free Tier on Hobby Plan).

---

## 🌟 Key Features

- **📊 Live Storage Visualizer**: Real-time gauge tracking total storage used, remaining space, file count, and percentage against the 1 GB Vercel Free Tier quota.
- **📁 File Explorer & Categories**: View, search, and filter files (Images, Docs, Archives/Vaults, Media, Code).
- **⚡ Direct Drag & Drop Upload**: Multi-file uploads with instant cloud sync.
- **👁️ Instant Preview & Modal**: Preview images, media, and inspect blob metadata.
- **🔗 1-Click Link Copying & Direct Downloads**: Shareable public URLs for any uploaded asset.
- **🔌 Full REST API**: Easily connect desktop apps (like WinLocker), scripts, curl, or web apps.
- **🔄 Local Storage Fallback**: Automatic local disk storage mode for offline local development without needing cloud tokens.

---

## 🛠️ Free 1-Click Deployment to Vercel

### Method 1: Deploy with Vercel CLI (Fastest)

1. Open PowerShell / Terminal in the `server` directory:
   ```bash
   cd d:\Win_locker\server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Deploy to Vercel for free:
   ```bash
   npx vercel
   ```
4. Follow the prompt instructions (Select your free Vercel Hobby account).

---

### Method 2: Deploy with GitHub & Vercel Dashboard

1. Push this repository or the `server` directory to your GitHub account.
2. Go to [https://vercel.com/dashboard](https://vercel.com/dashboard).
3. Click **Add New...** &rarr; **Project** &rarr; Select your GitHub repository.
4. Set **Root Directory** to `server` (if in a subfolder) or `./`.
5. Click **Deploy**.

---

## 🗄️ Setting Up Free Vercel Blob Storage (1 GB Free)

1. In your **Vercel Project Dashboard**, navigate to the **Storage** tab.
2. Click **Create Database** &rarr; Select **Blob** &rarr; Click **Continue**.
3. Choose a store name (e.g. `vault-storage`) and click **Create**.
4. In the Blob settings / Quickstart tab, copy the **`BLOB_READ_WRITE_TOKEN`**.
5. Go to your Project **Settings** &rarr; **Environment Variables**, and add:
   - Key: `BLOB_READ_WRITE_TOKEN`
   - Value: `vercel_blob_rw_...`
6. Redeploy or restart your project. Your dashboard is now live and linked to Vercel Blob!

---

## 💻 Running Locally (Development Mode)

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Copy `.env.example` to `.env` and add your `BLOB_READ_WRITE_TOKEN`:
   ```bash
   cp .env.example .env
   ```
   *(If no token is provided, the server will automatically use local disk storage in `server/uploads/`)*.
4. Start the server:
   ```bash
   npm start
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Server status, uptime, and active storage mode. |
| `/api/storage/stats` | `GET` | Quota metrics, total used bytes, remaining space, and category counts. |
| `/api/storage/files` | `GET` | List all files. Query params: `search`, `category`, `limit`, `offset`. |
| `/api/storage/upload` | `POST` | Upload file(s) (`multipart/form-data` with field name `files`). |
| `/api/storage/delete` | `DELETE` | Delete blob by URL or filename (`?url=<url>`). |
| `/api/storage/local/:filename` | `GET` | Fetch or download a local file (`?download=1`). |
