# How to Start the Project

## Before Anything Else — Load the Project Prompt

Before starting work or asking Claude to make any changes:

1. Open the `prompt.md` file in the root of this project
2. Copy everything inside it
3. Paste it as your **first message** to Claude before describing what you want

This gives Claude the full context about this project so it doesn't make wrong assumptions.

---

## Step 1 — Open Terminals

In VS Code, right-click the `backend` folder in the left sidebar → **Open in Integrated Terminal**  
Do the same for the `frontend` folder.  
You should have 2 terminals open.

---

## Step 2 — Start the Backend

In the **backend** terminal:

```
npm run start
```

Wait until you see `Nest application successfully started` before moving on.

---

## Step 3 — Start the Frontend

In the **frontend** terminal:

```
npm run dev
```

---

## Step 4 — Open in Browser

| Page         | URL                                  |
|--------------|--------------------------------------|
| Store        | http://localhost:8001                |
| Admin Login  | http://localhost:8001/admin-login    |

---

## Step 5 — Stop the Servers

Go to the respective terminal and press **Ctrl + C**.

---

## Step 6 — Use Claude

Click the **+** icon at the bottom of VS Code to open a new terminal, then type:

```
claude
```

Write your prompt / describe what changes you want. After Claude is done, refresh the browser to see the changes.

---

## How to Save & Push Changes to GitHub

### Step 1 — Open Source Control

Click the **branch icon** in the left sidebar of VS Code (looks like a Y shape, third icon down).  
You'll see a list of all files you changed.

---

### Step 2 — Select Which Files to Stage

Next to each changed file you'll see a **+** button — click it to stage that file (this means "include this in the commit").

> **DO NOT stage these files — ever:**
> - `package-lock.json` or `yarn.lock` — only include these if you specifically ran `npm install` to add a new package
> - `.env` — **never push this**, it contains passwords and secret keys
> - Any file inside `node_modules/`

If you accidentally staged a file, click the **−** button next to it to unstage.

---

### Step 3 — Write a Commit Message

At the top of the Source Control panel there is a text box that says **"Message"**.  
Type a short description of what you changed, for example:
- `fix checkout bug`
- `add discount feature`
- `update product page UI`

---

### Step 4 — Commit

Click the **✓ Commit** button (or press `Ctrl + Enter`).

---

### Step 5 — Push

After committing, click the **Sync Changes** button (or the cloud/arrow icon that appears).  
This pushes your changes to GitHub so they are saved online.

---

### Quick Rules

| Do                              | Don't                          |
|---------------------------------|--------------------------------|
| Stage only files you changed    | Never stage `.env`             |
| Write a clear commit message    | Never stage `package-lock.json` unless you added a new package |
| Push after every commit         | Never push `node_modules/`     |

---

## Troubleshooting

### MongoDB won't connect

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → **Network Access** → **Add IP Address**
2. Run this in any terminal to get your current IP:
   ```
   (Invoke-RestMethod https://api.ipify.org?format=json).ip
   ```
3. Paste that IP and confirm
4. If the cluster shows **"Paused"**, click **Resume** first
5. Restart the backend terminal

### Port already in use

```
netstat -ano | findstr :7001
taskkill /PID <replace-with-pid> /F
```
