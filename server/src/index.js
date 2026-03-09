import "dotenv/config";
import cors from "cors";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = Number(process.env.PORT || 5000);
const mongoUri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "sample_mflix";
const collectionName = process.env.MONGO_COLLECTION || "movies";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;
const MAX_SEARCH_LENGTH = 100;
const MAX_TEXT_LENGTH = 1200;
const ALLOWED_CORS_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (ALLOWED_CORS_ORIGINS.length > 0) {
  app.use(
    cors({
      origin: ALLOWED_CORS_ORIGINS,
    })
  );
} else {
  app.use(cors());
}
app.use(express.json());

const client = new MongoClient(mongoUri);
let moviesCollection;
let historyCollection;
let ratingsCollection;
let reviewsCollection;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

const normalizeString = (value) => (value || "").toString().trim();

const clampText = (value, maxLength = MAX_TEXT_LENGTH) => normalizeString(value).slice(0, maxLength);

const normalizeUserId = (value) => {
  const cleaned = normalizeString(value);
  if (!cleaned) return "guest";
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "guest";
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRating = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 1 || num > 10) return null;
  return Math.round(num * 10) / 10;
};

const toTrailerUrl = (title, year) => {
  const query = `${title || "movie"} ${year || ""} official trailer`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
};

const toMovieSummary = (doc) => ({
  _id: doc._id,
  title: doc.title || "Untitled",
  year: doc.year || "Unknown",
  poster: doc.poster || null,
  genres: Array.isArray(doc.genres) ? doc.genres : [],
  plot: doc.plot || doc.fullplot || "",
  rated: doc.rated || "N/A",
  runtime: doc.runtime || "N/A",
  imdbRating: doc.imdb?.rating ?? null,
  trailerUrl: toTrailerUrl(doc.title, doc.year),
});

const mapItunesMovie = (item) => {
  const releaseYear = item?.releaseDate ? new Date(item.releaseDate).getFullYear() : "Unknown";
  return {
    _id: `itunes-${item?.trackId || item?.trackName || Math.random().toString(36).slice(2, 8)}`,
    title: item?.trackName || "Untitled",
    year: Number.isFinite(releaseYear) ? releaseYear : "Unknown",
    poster: item?.artworkUrl100?.replace("100x100bb", "600x600bb") || null,
    genres: item?.primaryGenreName ? [item.primaryGenreName] : [],
    plot: item?.longDescription || item?.shortDescription || "",
    rated: item?.contentAdvisoryRating || "N/A",
    runtime: item?.trackTimeMillis ? `${Math.round(item.trackTimeMillis / 60000)} min` : "N/A",
    imdbRating: null,
    trailerUrl: item?.trackViewUrl || toTrailerUrl(item?.trackName, releaseYear),
  };
};

const fetchItunesMovies = async ({ search, limit }) => {
  const term = search || "popular movies";
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "movie");
  url.searchParams.set("entity", "movie");
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iTunes API failed with status ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return items.map(mapItunesMovie);
};

const hasPersonalizationStore = () =>
  Boolean(historyCollection && ratingsCollection && reviewsCollection);

const normalizeMovieKey = (value) => clampText(value, 80) || "unknown";

const buildRatingSummary = async (movieKey, userId) => {
  const [aggregateRows, userRatingDoc] = await Promise.all([
    ratingsCollection
      .aggregate([
        { $match: { movieKey } },
        {
          $group: {
            _id: "$movieKey",
            average: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    ratingsCollection.findOne({ movieKey, userId }, { projection: { rating: 1 } }),
  ]);

  const aggregate = aggregateRows[0] || { average: null, count: 0 };
  return {
    average: aggregate.average ? Math.round(aggregate.average * 10) / 10 : null,
    count: aggregate.count || 0,
    userRating: userRatingDoc?.rating ?? null,
  };
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "movie-app-server",
    features: ["movies", "recommendations", "history", "ratings", "reviews"],
  });
});

app.get("/api/movies", async (req, res) => {
  try {
    const search = normalizeString(req.query.search).slice(0, MAX_SEARCH_LENGTH);
    const genre = normalizeString(req.query.genre).slice(0, 50);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);

    const filter = {};
    if (search) {
      filter.title = { $regex: escapeRegex(search), $options: "i" };
    }
    if (genre) {
      filter.genres = genre;
    }

    if (moviesCollection) {
      const [items, total] = await Promise.all([
        moviesCollection
          .find(filter)
          .project({
            title: 1,
            year: 1,
            poster: 1,
            genres: 1,
            plot: 1,
            fullplot: 1,
            rated: 1,
            runtime: 1,
            imdb: 1,
          })
          .sort({ year: -1, title: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        moviesCollection.countDocuments(filter),
      ]);

      if (items.length > 0) {
        return res.json({
          items: items.map(toMovieSummary),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(Math.ceil(total / limit), 1),
          },
          source: "mongodb",
        });
      }
    }

    const externalItems = await fetchItunesMovies({ search, limit });
    const genreFiltered = genre
      ? externalItems.filter((item) =>
          Array.isArray(item.genres) &&
          item.genres.some((entry) => entry.toLowerCase() === genre.toLowerCase())
        )
      : externalItems;
    const startIndex = (page - 1) * limit;
    const pagedItems = genreFiltered.slice(startIndex, startIndex + limit);

    return res.json({
      items: pagedItems,
      pagination: {
        page,
        limit,
        total: genreFiltered.length,
        totalPages: Math.max(Math.ceil(genreFiltered.length / limit), 1),
      },
      source: "itunes-fallback",
    });
  } catch (error) {
    console.error("GET /api/movies failed:", error);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

app.get("/api/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!moviesCollection) {
      return res
        .status(503)
        .json({ error: "Movie details are unavailable when database is not configured" });
    }
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid movie id" });
    }

    const movie = await moviesCollection.findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          title: 1,
          year: 1,
          poster: 1,
          genres: 1,
          plot: 1,
          fullplot: 1,
          rated: 1,
          runtime: 1,
          imdb: 1,
          cast: 1,
          directors: 1,
          languages: 1,
          countries: 1,
        },
      }
    );

    if (!movie) {
      return res.status(404).json({ error: "Movie not found" });
    }

    res.json({
      ...toMovieSummary(movie),
      fullplot: movie.fullplot || "",
      cast: Array.isArray(movie.cast) ? movie.cast : [],
      directors: Array.isArray(movie.directors) ? movie.directors : [],
      languages: Array.isArray(movie.languages) ? movie.languages : [],
      countries: Array.isArray(movie.countries) ? movie.countries : [],
    });
  } catch (error) {
    console.error("GET /api/movies/:id failed:", error);
    res.status(500).json({ error: "Failed to fetch movie details" });
  }
});

app.get("/api/users/:userId/history", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.json({ items: [] });
    }
    const userId = normalizeUserId(req.params.userId);
    const limit = Math.min(parsePositiveInt(req.query.limit, 25), MAX_LIMIT);

    const items = await historyCollection
      .find({ userId })
      .sort({ lastViewedAt: -1 })
      .limit(limit)
      .project({
        _id: 0,
        movieKey: 1,
        title: 1,
        year: 1,
        poster: 1,
        genres: 1,
        source: 1,
        views: 1,
        lastViewedAt: 1,
      })
      .toArray();

    res.json({ items });
  } catch (error) {
    console.error("GET /api/users/:userId/history failed:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

app.post("/api/users/:userId/history", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.status(201).json({ ok: true, persisted: false });
    }
    const userId = normalizeUserId(req.params.userId);
    const movieKey = normalizeMovieKey(req.body?.movieKey);
    const title = clampText(req.body?.title, 200) || "Untitled";
    const year = clampText(req.body?.year, 20) || "Unknown";
    const poster = clampText(req.body?.poster, 400) || null;
    const source = clampText(req.body?.source, 20) || "unknown";
    const genres = Array.isArray(req.body?.genres)
      ? req.body.genres.map((item) => clampText(item, 40)).filter(Boolean).slice(0, 8)
      : [];

    if (!movieKey || movieKey === "unknown") {
      return res.status(400).json({ error: "movieKey is required" });
    }

    await historyCollection.updateOne(
      { userId, movieKey },
      {
        $set: {
          title,
          year,
          poster,
          genres,
          source,
          lastViewedAt: new Date(),
        },
        $inc: { views: 1 },
      },
      { upsert: true }
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("POST /api/users/:userId/history failed:", error);
    res.status(500).json({ error: "Failed to store history" });
  }
});

app.get("/api/users/:userId/recommendations", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      const limit = Math.min(parsePositiveInt(req.query.limit, 12), MAX_LIMIT);
      const fallbackItems = await fetchItunesMovies({ search: "top movies", limit });
      return res.json({
        items: fallbackItems,
        strategy: "itunes-fallback",
        favoriteGenres: [],
      });
    }
    const userId = normalizeUserId(req.params.userId);
    const limit = Math.min(parsePositiveInt(req.query.limit, 12), MAX_LIMIT);
    const recentHistory = await historyCollection
      .find({ userId })
      .sort({ lastViewedAt: -1 })
      .limit(100)
      .toArray();

    const genreCount = new Map();
    const watchedObjectIds = [];
    recentHistory.forEach((entry) => {
      const entryGenres = Array.isArray(entry.genres) ? entry.genres : [];
      entryGenres.forEach((genre) => {
        const key = clampText(genre, 40);
        if (!key) return;
        genreCount.set(key, (genreCount.get(key) || 0) + 1);
      });

      if (entry.source === "db" && ObjectId.isValid(entry.movieKey)) {
        watchedObjectIds.push(new ObjectId(entry.movieKey));
      }
    });

    const favoriteGenres = Array.from(genreCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([genre]) => genre);

    const filter = {};
    if (favoriteGenres.length > 0) {
      filter.genres = { $in: favoriteGenres };
    }
    if (watchedObjectIds.length > 0) {
      filter._id = { $nin: watchedObjectIds };
    }

    const docs = await moviesCollection
      .find(filter)
      .project({
        title: 1,
        year: 1,
        poster: 1,
        genres: 1,
        plot: 1,
        fullplot: 1,
        rated: 1,
        runtime: 1,
        imdb: 1,
      })
      .sort({ "imdb.rating": -1, year: -1 })
      .limit(limit)
      .toArray();

    res.json({
      items: docs.map(toMovieSummary),
      strategy: favoriteGenres.length > 0 ? "genre-personalized" : "top-rated-fallback",
      favoriteGenres,
    });
  } catch (error) {
    console.error("GET /api/users/:userId/recommendations failed:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

app.get("/api/community/movies/:movieKey/ratings", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.json({ average: null, count: 0, userRating: null });
    }
    const movieKey = normalizeMovieKey(req.params.movieKey);
    const userId = normalizeUserId(req.query.userId);
    const summary = await buildRatingSummary(movieKey, userId);
    res.json(summary);
  } catch (error) {
    console.error("GET /api/community/movies/:movieKey/ratings failed:", error);
    res.status(500).json({ error: "Failed to fetch ratings" });
  }
});

app.post("/api/community/movies/:movieKey/ratings", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.status(201).json({ average: null, count: 0, userRating: null });
    }
    const movieKey = normalizeMovieKey(req.params.movieKey);
    const userId = normalizeUserId(req.body?.userId);
    const rating = parseRating(req.body?.rating);

    if (!rating) {
      return res.status(400).json({ error: "rating must be a number between 1 and 10" });
    }

    await ratingsCollection.updateOne(
      { userId, movieKey },
      {
        $set: {
          userId,
          movieKey,
          rating,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    const summary = await buildRatingSummary(movieKey, userId);
    res.status(201).json(summary);
  } catch (error) {
    console.error("POST /api/community/movies/:movieKey/ratings failed:", error);
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

app.get("/api/community/movies/:movieKey/reviews", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.json({ items: [] });
    }
    const movieKey = normalizeMovieKey(req.params.movieKey);
    const limit = Math.min(parsePositiveInt(req.query.limit, 10), MAX_LIMIT);

    const items = await reviewsCollection
      .find({ movieKey })
      .sort({ createdAt: -1 })
      .limit(limit)
      .project({
        _id: 0,
        reviewId: "$_id",
        userId: 1,
        username: 1,
        rating: 1,
        text: 1,
        containsSpoilers: 1,
        createdAt: 1,
      })
      .toArray();

    res.json({ items });
  } catch (error) {
    console.error("GET /api/community/movies/:movieKey/reviews failed:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

app.post("/api/community/movies/:movieKey/reviews", async (req, res) => {
  try {
    if (!hasPersonalizationStore()) {
      return res.status(201).json({ ok: true, persisted: false });
    }
    const movieKey = normalizeMovieKey(req.params.movieKey);
    const userId = normalizeUserId(req.body?.userId);
    const username = clampText(req.body?.username, 50) || "Movie Fan";
    const text = clampText(req.body?.text, MAX_TEXT_LENGTH);
    const rating = req.body?.rating == null ? null : parseRating(req.body?.rating);
    const containsSpoilers = Boolean(req.body?.containsSpoilers);

    if (text.length < 3) {
      return res.status(400).json({ error: "Review text must be at least 3 characters long" });
    }
    if (req.body?.rating != null && !rating) {
      return res.status(400).json({ error: "rating must be a number between 1 and 10" });
    }

    await reviewsCollection.insertOne({
      movieKey,
      userId,
      username,
      text,
      rating,
      containsSpoilers,
      createdAt: new Date(),
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("POST /api/community/movies/:movieKey/reviews failed:", error);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

const start = async () => {
  try {
    if (mongoUri) {
      await client.connect();
      const db = client.db(dbName);
      moviesCollection = db.collection(collectionName);
      historyCollection = db.collection("app_user_history");
      ratingsCollection = db.collection("app_movie_ratings");
      reviewsCollection = db.collection("app_movie_reviews");

      await Promise.all([
        historyCollection.createIndex({ userId: 1, movieKey: 1 }, { unique: true }),
        historyCollection.createIndex({ userId: 1, lastViewedAt: -1 }),
        ratingsCollection.createIndex({ userId: 1, movieKey: 1 }, { unique: true }),
        ratingsCollection.createIndex({ movieKey: 1, updatedAt: -1 }),
        reviewsCollection.createIndex({ movieKey: 1, createdAt: -1 }),
      ]);
      console.log("MongoDB connected for primary movie and community data.");
    } else {
      console.warn(
        "MONGO_URI not set. Running in fallback mode with external movie API only."
      );
    }

    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

const shutdown = async () => {
  try {
    await client.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
