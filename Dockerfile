FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY server.js index.html ./

# Expose port (Render will set PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

