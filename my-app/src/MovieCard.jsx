
import React from 'react';

const MovieCard = ({ movie: { Year, Poster, Title, Type, Runtime, Rating, TrailerUrl } }) => {
  return (
    <div className="movie">
      <div>
        <p>{Year}</p>
      </div>

      <div>
        <img src={Poster !== "N/A" ? Poster : "https://via.placeholder.com/400"} alt={Title} />
      </div>

      <div>
        <span>{Type}</span>
        <h3>{Title}</h3>
        <p className="movie-meta">Runtime: {Runtime}</p>
        <p className="movie-meta">IMDb: {Rating || "N/A"}</p>
        <button
          type="button"
          onClick={() => window.open(TrailerUrl, "_blank", "noopener,noreferrer")}
        >
          Watch Trailer
        </button>
      </div>
    </div>
  );
}

export default MovieCard;
