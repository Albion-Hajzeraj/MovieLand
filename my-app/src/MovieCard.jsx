import React, { useEffect, useMemo, useState } from "react";

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const fetchJson = async (url, options = {}) => {
  const { method = "GET", body, signal } = options;
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

const MovieCard = ({
  movie: { movieKey, source, Year, Poster, Title, Type, Runtime, Rating, TrailerUrl, Genres },
  userId,
  apiBase,
  onTrackWatch,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [ratingSummary, setRatingSummary] = useState({ average: null, count: 0, userRating: null });
  const [selectedRating, setSelectedRating] = useState("");
  const [ratingSaving, setRatingSaving] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [reviewsVisible, setReviewsVisible] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);

  const safeMovieKey = movieKey || `fallback-${Title}`;
  const genreText =
    Array.isArray(Genres) && Genres.length > 0 ? Genres.slice(0, 3).join(" | ") : "No genre";
  const posterSrc = Poster && Poster !== "N/A" ? Poster : "";
  const encodedMovieKey = encodeURIComponent(safeMovieKey);
  const communityBase = `${apiBase}/community/movies/${encodedMovieKey}`;
  const shareText = useMemo(
    () => `Check out "${Title}" on MovieLand. ${TrailerUrl || ""}`.trim(),
    [Title, TrailerUrl]
  );

  const loadRatings = async (signal) => {
    const summary = await fetchJson(`${communityBase}/ratings?userId=${encodeURIComponent(userId)}`, {
      signal,
    }).catch(() => ({ average: null, count: 0, userRating: null }));
    setRatingSummary(summary);
    if (summary?.userRating != null) {
      setSelectedRating(String(summary.userRating));
    }
  };

  const loadReviews = async (signal) => {
    const payload = await fetchJson(`${communityBase}/reviews?limit=5`, { signal }).catch(() => ({
      items: [],
    }));
    setReviews(Array.isArray(payload?.items) ? payload.items : []);
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRatings(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityBase, userId]);

  useEffect(() => {
    if (!reviewsVisible) return undefined;
    const controller = new AbortController();
    loadReviews(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsVisible, communityBase]);

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

  const submitRating = async () => {
    const numericRating = Number(selectedRating);
    if (!numericRating) return;
    try {
      setRatingSaving(true);
      const summary = await fetchJson(`${communityBase}/ratings`, {
        method: "POST",
        body: { userId, rating: numericRating },
      });
      setRatingSummary(summary);
    } catch (error) {
      console.error(error);
    } finally {
      setRatingSaving(false);
    }
  };

  const submitReview = async () => {
    const text = reviewText.trim();
    if (text.length < 3) return;
    try {
      setReviewSaving(true);
      await fetchJson(`${communityBase}/reviews`, {
        method: "POST",
        body: {
          userId,
          username: "MovieLand User",
          text,
          rating: selectedRating ? Number(selectedRating) : undefined,
          containsSpoilers,
        },
      });
      setReviewText("");
      setContainsSpoilers(false);
      await loadReviews();
    } catch (error) {
      console.error(error);
    } finally {
      setReviewSaving(false);
    }
  };

  const shareMovie = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${Title} on MovieLand`,
          text: shareText,
          url: TrailerUrl || window.location.href,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
    } catch (error) {
      console.error(error);
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
          <p className="movie-meta">
            Community: {ratingSummary.average ?? "N/A"} ({ratingSummary.count} votes)
          </p>
        </div>

        <div className="movie-actions-row">
          <select
            className="rating-select"
            value={selectedRating}
            onChange={(event) => setSelectedRating(event.target.value)}
            aria-label={`Rate ${Title}`}
          >
            <option value="">Rate</option>
            {RATING_VALUES.map((entry) => (
              <option key={`${safeMovieKey}-rate-${entry}`} value={entry}>
                {entry}/10
              </option>
            ))}
          </select>
          <button type="button" onClick={submitRating} disabled={!selectedRating || ratingSaving}>
            {ratingSaving ? "Saving..." : "Submit Rating"}
          </button>
        </div>

        <div className="movie-actions-row">
          <button type="button" onClick={onWatchTrailer}>
            Watch Trailer
          </button>
          <button type="button" onClick={shareMovie}>
            Share
          </button>
        </div>

        <button type="button" onClick={() => setReviewsVisible((prev) => !prev)}>
          {reviewsVisible ? "Hide Reviews" : "Show Reviews"}
        </button>

        {reviewsVisible && (
          <div className="reviews-panel">
            <div className="review-form">
              <textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Write a short review..."
                rows={3}
              />
              <label className="spoiler-toggle">
                <input
                  type="checkbox"
                  checked={containsSpoilers}
                  onChange={(event) => setContainsSpoilers(event.target.checked)}
                />
                Spoiler
              </label>
              <button type="button" onClick={submitReview} disabled={reviewText.trim().length < 3 || reviewSaving}>
                {reviewSaving ? "Posting..." : "Post Review"}
              </button>
            </div>
            <div className="reviews-list">
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <div className="review-item" key={String(review.reviewId)}>
                    <p className="review-author">
                      {review.username || "Movie Fan"} {review.rating ? `- ${review.rating}/10` : ""}
                    </p>
                    {review.containsSpoilers ? <p className="review-spoiler">Spoiler warning</p> : null}
                    <p className="review-text">{review.text}</p>
                  </div>
                ))
              ) : (
                <p className="review-empty">No reviews yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
