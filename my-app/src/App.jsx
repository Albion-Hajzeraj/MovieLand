import React, { useMemo, useState, useEffect } from "react";
import MovieCard from "./MovieCard";
import SearchIcon from "./search.svg";
import "./App.css";

const TVMAZE_API_URL = "https://api.tvmaze.com/search/shows?q=";
const MOVIES_API_URL = `${process.env.REACT_APP_API_BASE || "http://localhost:5000/api"}/movies`;
const ITEMS_PER_PAGE = 12;

const CATEGORIES = [
    { key: "all", label: "All" },
    { key: "movies", label: "Movies" },
    { key: "shows", label: "Shows" },
    { key: "documentary", label: "Documentary" },
    { key: "comedy", label: "Comedy" },
    { key: "kids", label: "Kids" },
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
    return /^https?:\/\//i.test(str);
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

const mapTvMazeMovie = (item) => {
    const show = item?.show ?? {};
    const title = show?.name ?? "Untitled";
    const mediaType = normalize(show?.type || "").includes("movie") ? "movie" : "show";
    return {
        imdbID: show?.id ? `tv-${show.id}` : `tv-${title}`,
        Year: show?.premiered ? String(new Date(show.premiered).getFullYear()) : "Unknown",
        Poster: show?.image?.original ?? show?.image?.medium ?? "N/A",
        Title: title,
        Type: mediaType,
        Runtime: show?.runtime ?? "N/A",
        Rating: show?.rating?.average ?? "N/A",
        TrailerUrl: withTrailer(title),
        Genres: Array.isArray(show?.genres) ? show.genres : [],
    };
};

const mapSampleMovie = (item) => {
    const title = item?.title ?? "Untitled";
    const runtimeValue =
        typeof item?.runtime === "number"
            ? `${item.runtime} min`
            : item?.runtime && item.runtime !== "N/A"
            ? String(item.runtime)
            : "N/A";
    return {
        imdbID: item?._id ? `db-${item._id}` : `db-${title}`,
        Year: item?.year ? String(item.year) : "Unknown",
        Poster: item?.poster ?? "N/A",
        Title: title,
        Type: "movie",
        Runtime: runtimeValue,
        Rating: item?.imdbRating ?? "N/A",
        TrailerUrl: item?.trailerUrl || withTrailer(title),
        Genres: Array.isArray(item?.genres) ? item.genres : [],
    };
};

const uniqueById = (items) =>
    Array.from(new Map(items.map((item) => [item.imdbID, item])).values());

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
};

const toApiUrl = (query = "", genre = "", limit = 50) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (query) params.set("search", query);
    if (genre && genre !== "All Genres") params.set("genre", genre);
    return `${MOVIES_API_URL}?${params.toString()}`;
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

    const filteredMovies = useMemo(() => {
        let filtered = movies.filter((movie) => hasPosterUrl(movie.Poster));
        const query = searchTerm.trim();

        if (category === "movies") {
            filtered = filtered.filter((movie) => movie.Type === "movie");
        } else if (category === "shows") {
            filtered = filtered.filter((movie) => movie.Type === "show");
        } else if (category !== "all") {
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

    const loadDiscovery = async () => {
        const showQueries = ["top", "popular", "marvel", "crime", "planet"];
        const [moviePayload, showResponses] = await Promise.all([
            fetchJson(toApiUrl("", genre, 50)).catch(() => ({ items: [] })),
            Promise.all(
                showQueries.map((q) =>
                    fetchJson(`${TVMAZE_API_URL}${encodeURIComponent(q)}`).catch(() => [])
                )
            ),
        ]);

        const moviesFromSample = Array.isArray(moviePayload?.items)
            ? moviePayload.items.map(mapSampleMovie)
            : [];
        const showsFromTvMaze = showResponses.flatMap((payload) =>
            Array.isArray(payload) ? payload.map(mapTvMazeMovie) : []
        );

        setMovies(uniqueById([...moviesFromSample, ...showsFromTvMaze]));
        setHasSearched(true);
    };

    const searchAllSources = async (title) => {
        const query = title?.trim();
        if (!query) {
            await loadDiscovery();
            return;
        }

        const [moviesPayload, showsPayload] = await Promise.all([
            fetchJson(toApiUrl(query, genre, 50)).catch(() => ({ items: [] })),
            fetchJson(`${TVMAZE_API_URL}${encodeURIComponent(query)}`).catch(() => []),
        ]);

        const moviesFromSample = Array.isArray(moviesPayload?.items)
            ? moviesPayload.items.map(mapSampleMovie)
            : [];
        const showsFromTvMaze = Array.isArray(showsPayload) ? showsPayload.map(mapTvMazeMovie) : [];

        setMovies(uniqueById([...moviesFromSample, ...showsFromTvMaze]));
        setHasSearched(true);
    };

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
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, category, genre]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            try {
                setLoading(true);
                setError("");
                await searchAllSources(searchTerm);
            } catch (err) {
                setMovies([]);
                setHasSearched(true);
                setError("Could not load movies right now. Please try again.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, genre]);

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
                    <img src={SearchIcon} alt="search" onClick={() => searchAllSources(searchTerm)} />
                </div>
            </header>

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
                        <MovieCard key={movie.imdbID} movie={movie} />
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
