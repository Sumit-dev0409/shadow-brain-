# Brain Shadow

Brain Shadow is a Next.js frontend with a separate Express/MongoDB backend.

## Local Development

Run the frontend from the repo root:

```bash
npm install
npm run dev
```

Run the backend from `backend/backend`:

```bash
npm install
npm run dev
```

Use `.env.example` and `backend/backend/.env.example` as the variable templates.

## Railway Deployment

Create two Railway services from this repo.

Backend service:

- Root directory: `backend/backend`
- Start command: `npm run start`
- Health check path: `/health`
- Add a Railway MongoDB plugin, or use MongoDB Atlas.
- Set the variables from `backend/backend/.env.example`.
- Set `MONGODB_URI` to the Railway MongoDB connection string. The backend also accepts Railway's `MONGO_URL` or a standard `DATABASE_URL`.

Frontend service:

- Root directory: `.`
- Start command: `npm run start`
- Set the variables from `.env.example`.
- Set `NEXT_PUBLIC_API_URL` and `BACKEND_URL` to the backend service public URL.

After both services have public URLs, set the backend `FRONTEND_URL` variable to the frontend public URL. If you use Google sign-in, add the frontend URL to your Google OAuth authorized JavaScript origins.
