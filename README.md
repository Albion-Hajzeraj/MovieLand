# Movie App (Portfolio Version)

A full-stack movie app with:
- React frontend (search, cards, watch trailer button)
- Node/Express backend
- MongoDB Atlas `sample_mflix` integration

## Stack
- Frontend: Create React App (`my-app`)
- Backend: Express + MongoDB Node driver (`server`)
- Data: `sample_mflix.movies`

## Run locally
Open two terminals at `Movie-App` root.

1. Backend
```bash
cd server
npm install
npm run dev
```

2. Frontend
```bash
cd my-app
npm install
npm start
```

Frontend runs at `http://localhost:3000` and backend at `http://localhost:5000`.

## Environment
- Backend env file: `server/.env`
- Frontend optional env file: `my-app/.env` (see `.env.example`)

Backend defaults:
- `MONGO_DB_NAME=sample_mflix`
- `MONGO_COLLECTION=movies`

## API endpoints
- `GET /api/health`
- `GET /api/movies?search=batman&limit=24&page=1`
- `GET /api/movies/:id`

## Notes
- "Watch Trailer" opens a YouTube trailer search for each movie title.
- This project is portfolio-focused and does not host licensed full-length movie streams.
