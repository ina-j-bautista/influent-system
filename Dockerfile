# ============================================================================
# INFLUENT Backend Dockerfile
# Combines Node.js (Express server) + Python (scraper/VADER scripts)
# in a single container, since the backend shells out to Python via
# child_process.exec().
# ============================================================================

FROM node:20-bookworm

# --- Install Python 3 and pip ---
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Install Python dependencies first (better Docker layer caching) ---
COPY requirements.txt ./
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

# --- Install Node dependencies ---
COPY package*.json ./
RUN npm install

# --- Copy the rest of the project ---
COPY . .

# Render sets PORT automatically; your app already hardcodes 3001 —
# we'll tell Render to route to 3001 in the dashboard, so no change needed
# here unless you'd rather read process.env.PORT (see note in Phase 5).
EXPOSE 3001

# ============================================================================
# IMPORTANT: Replace the line below with however you actually start your
# backend. Check your package.json "scripts" section for the exact command.
# Common options:
#   CMD ["npx", "tsx", "run-backend.ts"]
#   CMD ["npx", "ts-node", "run-backend.ts"]
#   CMD ["npm", "start"]
# ============================================================================
CMD ["npx", "tsx", "run-backend.ts"]
