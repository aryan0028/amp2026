# Tush - Temple Management App

A Flask web app for tracking donations, expenses, and attendance.

## Deploy Free on Render.com

### Step 1: Push to GitHub
1. Create a new GitHub repository
2. Upload all these files to it
3. **Do NOT upload `.env`** — it's in `.gitignore` for your safety

### Step 2: Create Render Account
Go to [render.com](https://render.com) and sign up free with GitHub.

### Step 3: Create a Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo
3. Set these settings:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`

### Step 4: Set Environment Variables
In Render dashboard → Environment, add:
- `SECRET_KEY` → any random string (e.g. `myrandomsecret123`)
- `DATABASE_URL` → leave blank to use SQLite (fine for small use), OR add your Supabase PostgreSQL URL

### Step 5: Deploy!
Click **Deploy** — your site will be live in ~2 minutes.

## Default Login
- Username: `admin`
- Password: `admin123`

> ⚠️ Change the admin password after first login!
