import React, { useState } from "react";

const MovieCard = ({ movie: { Year, Poster, Title, Type, Runtime, Rating, TrailerUrl, Genres } }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const genreText =
    Array.isArray(Genres) && Genres.length > 0 ? Genres.slice(0, 3).join(" | ") : "No genre";
  const posterSrc = Poster && Poster !== "N/A" ? Poster : "";

  if (!posterSrc || imageFailed) {
    return null;
  }

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
        <button
          type="button"
          onClick={() => TrailerUrl && window.open(TrailerUrl, "_blank", "noopener,noreferrer")}
        >
          Watch Trailer
        </button>
      </div>
    </div>
  );
};

export default MovieCard;
