# syntax=docker/dockerfile:1
# Pinned Playwright container image matching exact Playwright version (v1.48.2)
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

# Set environment for non-interactive installations
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV VERIFIER_PORT=8095

# Pin font stack and Xvfb for headed-under-Xvfb rendering reproducibility
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    fonts-dejavu-core=2.37-2build1 \
    fonts-liberation=1:1.07.4-11 \
    fonts-freefont-ttf=20120503-10build1 \
    fonts-noto-core=20201225-1build1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies (including adm-zip)
RUN npm ci

# Copy verifier source code
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Expose verifier service port
EXPOSE 8095

# Launch verifier under Xvfb display server
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x1024x24", "node", "dist/server.js"]
