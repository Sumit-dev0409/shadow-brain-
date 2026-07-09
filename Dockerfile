FROM node:20-alpine

WORKDIR /app

# Install backend dependencies first (production only)
COPY backend/backend/package*.json ./backend/backend/
RUN npm --prefix backend/backend install --omit=dev

# Install frontend dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the source
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must be available as build args here — setting them only as a runtime
# Railway variable has no effect on the built output.
# NEXT_PUBLIC_API_URL is a same-origin relative path: the frontend and backend
# run in this one container, and next.config.ts rewrites /backend/* to the
# backend process internally, so the browser never needs the backend's own URL.
ENV NEXT_PUBLIC_API_URL=/backend
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

RUN npm run build

# Backend listens on a fixed internal port — Railway's dynamic $PORT is used
# by the frontend (the publicly routed process), so the two can't collide.
ENV BACKEND_PORT=8000
ENV BACKEND_URL=http://localhost:8000

EXPOSE 3000

RUN chmod +x start.sh
CMD ["./start.sh"]
