import "dotenv/config";
import cors from "cors";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = Number(process.env.PORT || 5000);
const mongoUri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "sample_mflix";
const collectionName = process.env.MONGO_COLLECTION || "movies";

if (!mongoUri) {
  console.error("Missing MONGO_URI in server/.env");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

const client = new MongoClient(mongoUri);
let moviesCollection;

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "movie-app-server" });
});

app.get("/api/movies", async (req, res) => {
  try {
    const search = (req.query.search || "").toString().trim();
    const genre = (req.query.genre || "").toString().trim();
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const page = Math.max(Number(req.query.page || 1), 1);

    const filter = {};
    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }
    if (genre) {
      filter.genres = genre;
    }

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

    res.json({
      items: items.map(toMovieSummary),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch movies", details: error.message });
  }
});

app.get("/api/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
    res.status(500).json({ error: "Failed to fetch movie details", details: error.message });
  }
});

const start = async () => {
  try {
    await client.connect();
    const db = client.db(dbName);
    moviesCollection = db.collection(collectionName);
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

start();
