import React, { useState, useEffect } from "react";
import MovieCard from "./MovieCard";
import SearchIcon from "./search.svg";
import "./App.css";

const API_URL = `${process.env.REACT_APP_API_BASE || "http://localhost:5000/api"}/movies`;

const toMovieShape = (movie) => ({
    imdbID: movie?._id ?? `${movie?.title ?? "movie"}-unknown`,
    Year: movie?.year ? String(movie.year) : "Unknown",
    Poster: movie?.poster ?? "N/A",
    Title: movie?.title ?? "Untitled",
    Type: "movie",
    Runtime: movie?.runtime ?? "N/A",
    Rating: movie?.imdbRating ?? "N/A",
    TrailerUrl: movie?.trailerUrl ?? "",
});

const App = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [movies, setMovies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        searchMovies("batman");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const searchMovies = async (title) => {
        try {
            setLoading(true);
            setError("");
            const query = title?.trim() || "batman";
            const response = await fetch(`${API_URL}?search=${encodeURIComponent(query)}&limit=24`);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const data = await response.json();
            setMovies(Array.isArray(data?.items) ? data.items.map(toMovieShape) : []);
        } catch (err) {
            setMovies([]);
            setError("Could not load movies. Make sure the backend is running on port 5000.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
            searchMovies(searchTerm);
        }
    };

    return (
        <div className="app">
            <h1>MovieLand</h1>

            <div className="search">
                <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search for movies"
                />
                <img
                    src={SearchIcon}
                    alt="search"
                    onClick={() => searchMovies(searchTerm)}
                />
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

            {movies?.length > 0 ? (
                <div className="container">
                    {movies.map((movie) => (
                        <MovieCard key={movie.imdbID} movie={movie} />
                    ))}
                </div>
            ) : !loading && !error ? (
                <div className="empty">
                    <h2>No movies found</h2>
                </div>
            ) : null}
        </div>
    );
};

export default App;
