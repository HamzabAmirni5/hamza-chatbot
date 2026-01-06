FROM node:20-bullseye-slim

WORKDIR /app

# Install system dependencies specifically for Baileys/Wehste (if needed for canvas usually, but basic bot needs minimal)
# Adding ffmpeg just in case you expand later, though for text-only GPT it's not strictly needed.
# It's good practice for WhatsApp bots.
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    chromium \
    imagemagick \
    webp && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]
