import React, { useState } from "react";

const MovieCard = ({
  movie: { movieKey, source, Year, Poster, Title, Type, Runtime, Rating, TrailerUrl, Genres },
  onTrackWatch,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const safeMovieKey = movieKey || `fallback-${Title}`;
  const genreText =
    Array.isArray(Genres) && Genres.length > 0 ? Genres.slice(0, 3).join(" | ") : "No genre";
  const posterSrc = Poster && Poster !== "N/A" ? Poster : "";

  if (!posterSrc || imageFailed) {
    return null;
  }

  const onWatchTrailer = () => {
    if (onTrackWatch) {
      onTrackWatch({
        movieKey: safeMovieKey,
        source: source || "db",
        Title,
        Year,
        Poster,
        Type,
        Genres,
        TrailerUrl,
      });
    }
    if (TrailerUrl) {
      window.open(TrailerUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="movie">
      <div className="movie-year-pill">
        <p>{Year}</p>
      </div>

      <div className="movie-poster-wrap">
        <img
          src={posterSrc}
          alt={Title}
          loading="lazy"
          onError={() => {
            setImageFailed(true);
          }}
        />
      </div>

      <div className="movie-content">
        <span>{Type}</span>
        <h3>{Title}</h3>
        <p className="movie-meta">{genreText}</p>
        <div className="movie-details">
          <p className="movie-meta">Runtime: {Runtime}</p>
          <p className="movie-meta">IMDb: {Rating || "N/A"}</p>
        </div>

        <div className="movie-actions-row">
          <button type="button" onClick={onWatchTrailer}>
            Watch Trailer
          </button>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
