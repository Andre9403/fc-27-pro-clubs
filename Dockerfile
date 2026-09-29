FROM node:20-alpine

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application source code
COPY . .

# Hugging Face Spaces port configuration
ENV PORT=7860
EXPOSE 7860

# Start Express multi-club hub
CMD ["node", "server.js"]
