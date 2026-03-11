import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import MovieCard from "./MovieCard";
import SearchIcon from "./search.svg";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "/api";
const MOVIES_API_FALLBACK = "http://localhost:5000/api";
const MOVIES_API_URLS = [`${API_BASE}/movies`, `${MOVIES_API_FALLBACK}/movies`];
const ITEMS_PER_PAGE = 24;

const CATEGORIES = [
    { key: "all", label: "All" },
    { key: "action", label: "Action" },
    { key: "comedy", label: "Comedy" },
    { key: "drama", label: "Drama" },
    { key: "documentary", label: "Documentary" },
];

const GENRES = [
    "All Genres",
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "Horror",
    "Mystery",
    "Romance",
    "Sci-Fi",
    "Thriller",
];

const normalize = (value) =>
    (value || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const hasPosterUrl = (value) => {
    if (!value || value === "N/A") return false;
    const str = String(value).trim();
    return /^https?:\/\//i.test(str) || str.startsWith("data:image/");
};

const oneEditAway = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i += 1;
            j += 1;
            continue;
        }
        edits += 1;
        if (edits > 1) return false;
        if (a.length > b.length) i += 1;
        else if (b.length > a.length) j += 1;
        else {
            i += 1;
            j += 1;
        }
    }
    return true;
};

const closeTokenMatch = (queryToken, titleTokens) =>
    titleTokens.some((token) => {
        if (token.includes(queryToken) || token.startsWith(queryToken)) return true;
        if (queryToken.length >= 4 && oneEditAway(queryToken, token)) return true;
        return false;
    });

const isCloseTitleMatch = (query, title) => {
    const q = normalize(query);
    if (!q) return true;
    const t = normalize(title);
    if (!t) return false;
    if (t.includes(q)) return true;
    const queryTokens = q.split(" ").filter(Boolean);
    const titleTokens = t.split(" ").filter(Boolean);
    return queryTokens.every((qt) => closeTokenMatch(qt, titleTokens));
};

const withTrailer = (title) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${title} official trailer`
    )}`;

const mapApiMovie = (item) => {
    const title = item?.title ?? "Untitled";
    const movieId = item?._id ? String(item._id) : title;
    return {
        movieKey: movieId,
        source: item?.source || "api",
        imdbID: `api-${movieId}`,
        Year: item?.year ? String(item.year) : "Unknown",
        Poster: item?.poster ?? "N/A",
        Title: title,
        Type: "movie",
        Runtime: item?.runtime ?? "N/A",
        Rating: item?.imdbRating ?? "N/A",
        TrailerUrl: item?.trailerUrl || withTrailer(title),
        Genres: Array.isArray(item?.genres) ? item.genres : [],
    };
};

const mapHistoryItem = (item) => ({
    movieKey: item?.movieKey || `history-${item?.Title || "item"}`,
    source: item?.source || "itunes",
    imdbID: `history-${item?.movieKey || item?.Title || "item"}`,
    Year: item?.Year || "Unknown",
    Poster: item?.Poster || "N/A",
    Title: item?.Title || "Untitled",
    Type: "movie",
    Runtime: "N/A",
    Rating: "N/A",
    TrailerUrl: withTrailer(item?.Title || "movie"),
    Genres: Array.isArray(item?.Genres) ? item.Genres : [],
});

const uniqueById = (items) =>
    Array.from(new Map(items.map((item) => [item.imdbID, item])).values());

const fetchJson = async (url, options = {}) => {
    const { signal, method = "GET", body } = options;
    const response = await fetch(url, {
        method,
        signal,
        headers: {
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchJson(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
};

const fetchApiMovies = async (query = "", genre = "", limit = 50) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (query) params.set("search", query);
    if (genre && genre !== "All Genres" && genre !== "all") params.set("genre", genre);
    const urls = MOVIES_API_URLS.map((base) => `${base}?${params.toString()}`);
    for (const url of urls) {
        const payload = await fetchWithTimeout(url).catch(() => null);
        if (payload && Array.isArray(payload?.items)) {
            return payload.items.map(mapApiMovie);
        }
    }
    return [];
};

const App = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [movies, setMovies] = useState([]);
    const [category, setCategory] = useState("all");
    const [genre, setGenre] = useState("All Genres");
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasSearched, setHasSearched] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [recommendedItems, setRecommendedItems] = useState([]);
    const [recommendationMeta, setRecommendationMeta] = useState(null);
    const requestSeqRef = useRef(0);

    const trackWatch = useCallback(
        async (movie) => {
            if (!movie?.movieKey) return;
            const optimisticItem = mapHistoryItem(movie);
            setHistoryItems((previous) => {
                const deduped = previous.filter((item) => item.movieKey !== optimisticItem.movieKey);
                return [optimisticItem, ...deduped].slice(0, 10);
            });
        },
        []
    );

    const filteredMovies = useMemo(() => {
        let filtered = movies.filter((movie) => hasPosterUrl(movie.Poster));
        const query = searchTerm.trim();

        if (category !== "all") {
            filtered = filtered.filter((movie) =>
                movie.Genres.some((g) => normalize(g).includes(normalize(category)))
            );
        }

        if (genre !== "All Genres") {
            filtered = filtered.filter((movie) =>
                movie.Genres.some((g) => normalize(g).includes(normalize(genre)))
            );
        }

        if (!query) return filtered;
        return filtered.filter((movie) => isCloseTitleMatch(query, movie.Title));
    }, [movies, searchTerm, category, genre]);

    const totalPages = Math.max(Math.ceil(filteredMovies.length / ITEMS_PER_PAGE), 1);
    const paginatedMovies = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredMovies.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredMovies, currentPage]);

    const loadDiscovery = useCallback(async () => {
        const apiMovies = await fetchApiMovies("", genre, 50).catch(() => []);
        if (apiMovies.length === 0) {
            setError("Could not load real movies right now.");
            setMovies([]);
        } else {
            setMovies(uniqueById(apiMovies));
            setError("");
        }
        setHasSearched(true);
    }, [genre]);

    const searchAllSources = useCallback(
        async (title) => {
            const query = title?.trim();
            if (!query) {
                await loadDiscovery();
                return;
            }

            const apiMatches = await fetchApiMovies(query, genre, 50).catch(() => []);
            setMovies(uniqueById(apiMatches));
            setHasSearched(true);
        },
        [genre, loadDiscovery]
    );

    const goHome = async () => {
        setSearchTerm("");
        setCategory("all");
        setGenre("All Genres");
        setCurrentPage(1);
        setError("");
        try {
            setLoading(true);
            await loadDiscovery();
        } catch (err) {
            setError("Could not load home right now. Please try again.");
            if (err?.name !== "AbortError") {
                console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    const runImmediateSearch = async () => {
        const requestId = requestSeqRef.current + 1;
        requestSeqRef.current = requestId;
        try {
            setLoading(true);
            setError("");
            await searchAllSources(searchTerm);
        } catch (err) {
            if (err?.name !== "AbortError" && requestSeqRef.current === requestId) {
                setMovies([]);
                setHasSearched(true);
                setError("Could not load movies right now. Please try again.");
                console.error(err);
            }
        } finally {
            if (requestSeqRef.current === requestId) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        if (movies.length === 0) return;
        const picks = movies.slice(0, 8);
        setRecommendedItems(picks);
        const genreCounts = new Map();
        picks.forEach((movie) => {
            (movie.Genres || []).forEach((entry) => {
                const key = normalize(entry);
                if (!key) return;
                genreCounts.set(entry, (genreCounts.get(entry) || 0) + 1);
            });
        });
        const favoriteGenres = Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
        setRecommendationMeta({
            strategy: "itunes-trending",
            favoriteGenres,
        });
    }, [movies]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, category, genre]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        const debounceId = setTimeout(async () => {
            const requestId = requestSeqRef.current + 1;
            requestSeqRef.current = requestId;

            try {
                setLoading(true);
                setError("");
                await searchAllSources(searchTerm);
            } catch (err) {
                if (err?.name !== "AbortError" && requestSeqRef.current === requestId) {
                    setMovies([]);
                    setHasSearched(true);
                    setError("Could not load movies right now. Please try again.");
                    console.error(err);
                }
            } finally {
                if (requestSeqRef.current === requestId) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(debounceId);
        };
    }, [searchTerm, genre, searchAllSources]);

    useEffect(() => {
        loadDiscovery().catch(() => {});
    }, [loadDiscovery]);

    return (
        <div className="app">
            <div className="page-glow page-glow-left" />
            <div className="page-glow page-glow-right" />

            <header className="hero">
                <div>
                    <h1 className="other-title clickable-title" onClick={goHome}>
                        MovieLand
                    </h1>
                    <p className="hero-subtitle">
                        Discover standout films and series with fast search, smart filters, and instant trailers.
                    </p>
                </div>
                <div className="search search-compact">
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by title"
                    />
                    <button
                        type="button"
                        className="search-icon-btn"
                        aria-label="Search movies"
                        onClick={runImmediateSearch}
                    >
                        <img src={SearchIcon} alt="" aria-hidden="true" />
                    </button>
                </div>
            </header>

            <section className="insights-grid">
                <div className="insights-card">
                    <h2>Recommended for You</h2>
                    <p className="insights-subtitle">
                        {recommendationMeta?.favoriteGenres?.length
                            ? `Based on: ${recommendationMeta.favoriteGenres.join(", ")}`
                            : "Start watching trailers to train recommendations."}
                    </p>
                    <div className="insights-items">
                        {recommendedItems.length > 0 ? (
                            recommendedItems.slice(0, 6).map((item) => (
                                <button
                                    type="button"
                                    key={`rec-${item.imdbID}`}
                                    className="insight-chip"
                                    onClick={() => setSearchTerm(item.Title)}
                                >
                                    {item.Title}
                                </button>
                            ))
                        ) : (
                            <p className="insights-empty">No recommendations yet.</p>
                        )}
                    </div>
                </div>
                <div className="insights-card">
                    <h2>Recent Watch History</h2>
                    <p className="insights-subtitle">Your recent trailer activity across movies and shows.</p>
                    <div className="insights-items">
                        {historyItems.length > 0 ? (
                            historyItems.slice(0, 6).map((item) => (
                                <button
                                    type="button"
                                    key={`history-${item.imdbID}`}
                                    className="insight-chip"
                                    onClick={() => setSearchTerm(item.Title)}
                                >
                                    {item.Title}
                                </button>
                            ))
                        ) : (
                            <p className="insights-empty">No watch history yet.</p>
                        )}
                    </div>
                </div>
            </section>

            <div className="other-version-shell">
                <div className="category-bar">
                    {CATEGORIES.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`category-btn ${category === item.key ? "active" : ""}`}
                            onClick={() => setCategory(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                    <select
                        className="genre-select"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                    >
                        {GENRES.map((entry) => (
                            <option key={entry} value={entry}>
                                {entry}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="results-meta">
                    {!loading && !error ? `${filteredMovies.length} results` : " "}
                </div>
            </div>

            {loading && (
                <div className="empty">
                    <h2>Loading movies...</h2>
                </div>
            )}

            {error && (
                <div className="empty">
                    <h2>{error}</h2>
                </div>
            )}

            {paginatedMovies?.length > 0 ? (
                <div className="container">
                    {paginatedMovies.map((movie) => (
                        <MovieCard key={movie.imdbID} movie={movie} onTrackWatch={trackWatch} />
                    ))}
                </div>
            ) : !loading && !error && hasSearched ? (
                <div className="empty">
                    <h2>No close matches found</h2>
                </div>
            ) : null}

            {!loading && !error && filteredMovies.length > ITEMS_PER_PAGE ? (
                <div className="pagination">
                    {Array.from({ length: totalPages }, (_, index) => {
                        const page = index + 1;
                        return (
                            <button
                                key={page}
                                type="button"
                                className={`page-btn ${currentPage === page ? "active" : ""}`}
                                onClick={() => setCurrentPage(page)}
                            >
                                {page}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};

export default App;

