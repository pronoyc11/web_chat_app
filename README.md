# AI Web Chat App

## Features
- Create account with email, password, and unique 4-digit code.
- Login and dashboard.
- Send chat requests by entering opponent's 4-digit code.
- Accept/decline requests.
- Real-time 1-1 chat.

## Local Setup & Test
1. Open terminal in project dir.
2. Run:
   ```
   npm install
   node server.js
   ```
3. Open http://localhost:3000
4. Create account (pick 4-digit code), login with another account, send request, accept, chat.

## Deploy to Render.com (Free Public Hosting)

### Step 1: Push to GitHub
1. Create new repo on GitHub (e.g. ai-chat-app).
2. Run in project dir:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOURUSERNAME/ai-chat-app.git
   git push -u origin main
   ```

### Step 2: Deploy Backend + Frontend on Render (Free)
1. Go to [render.com](https://render.com), sign up/login (free with GitHub).
2. Click **New > Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - Name: `ai-chat-app`
   - Environment: `Node`
   - Region: closest
   - Branch: `main`
   - Root Directory: `./` 
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Advanced > Add Environment Variable: `NODE_ENV=production`
6. Click **Create Web Service**.

### Step 3: Render will:
- Build & deploy automatically.
- Give public URL like `https://ai-chat-app-abc123.onrender.com`
- Free tier: sleeps after 15min inactivity (wakes on visit ~30s).
- SQLite works for light use; upgrade to Postgres later.

### Usage
Share public URL with anyone. Create accounts, use codes to chat!

**Note:** Render free has limits (750 hours/month). For production, add Render Postgres (free tier) by updating server.js DB to use `pg`.

App ready! 🚀
