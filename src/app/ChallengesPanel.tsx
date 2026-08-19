import { ArrowRight, Check, Flag, PlaneTakeoff, Route } from "lucide-react";
import { FLIGHT_CHALLENGES, type FlightChallenge } from "../challenges/challenges";

type ChallengesPanelProps = {
  selectedChallenge: FlightChallenge;
  filter: "all" | "featured";
  busy: boolean;
  onFilterChange: (filter: "all" | "featured") => void;
  onSelect: (challenge: FlightChallenge) => void;
  onStart: (challenge: FlightChallenge) => void;
};

const FEATURED_CHALLENGE = FLIGHT_CHALLENGES[0];

const routeLabel = (challenge: FlightChallenge): string => (
  `${challenge.originLabel} to ${challenge.destinationLabel}`
);

export function ChallengesPanel({
  selectedChallenge,
  filter,
  busy,
  onFilterChange,
  onSelect,
  onStart,
}: ChallengesPanelProps) {
  const visibleChallenges = filter === "featured"
    ? FLIGHT_CHALLENGES.filter((challenge) => challenge.category === "Featured")
    : FLIGHT_CHALLENGES;

  return (
    <div className="challenges-page">
      <section className="challenges-intro">
        <span>Challenges</span>
        <h2>Fly the whole flight plan.</h2>
        <p>Choose an authored route and follow each checkpoint from takeoff to a complete stop.</p>
      </section>

      <div className="challenges-layout">
        <main className="challenges-main">
          <section className={`featured-challenge challenge-theme--${FEATURED_CHALLENGE.theme}`}>
            <div className="featured-challenge__content">
              <span>Featured challenge</span>
              <h3>{FEATURED_CHALLENGE.title}</h3>
              <p>{FEATURED_CHALLENGE.description}</p>
              <div className="featured-challenge__actions">
                <button type="button" className="challenge-start" disabled={busy} onClick={() => onStart(FEATURED_CHALLENGE)}>
                  <PlaneTakeoff size={17} aria-hidden="true" /> Start challenge
                </button>
                <button type="button" onClick={() => onSelect(FEATURED_CHALLENGE)}>
                  View briefing <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
            <dl className="featured-challenge__facts">
              <div><dt>Aircraft</dt><dd>Cessna 172SP</dd></div>
              <div><dt>Time</dt><dd>{FEATURED_CHALLENGE.timeLabel}</dd></div>
              <div><dt>Conditions</dt><dd>Clear skies</dd></div>
            </dl>
          </section>

          <section className="challenge-library" aria-label="Challenge library">
            <header>
              <div>
                <span>Challenge library</span>
                <p>All available routes · {visibleChallenges.length} of {FLIGHT_CHALLENGES.length} challenges</p>
              </div>
              <div className="challenge-filters" role="tablist" aria-label="Challenge filters">
                <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => onFilterChange("all")}>All</button>
                <button type="button" role="tab" aria-selected={filter === "featured"} onClick={() => onFilterChange("featured")}>Featured</button>
              </div>
            </header>

            <div className="challenge-card-grid">
              {visibleChallenges.map((challenge) => (
                <button
                  type="button"
                  className={`challenge-card challenge-theme--${challenge.theme}${selectedChallenge.id === challenge.id ? " is-selected" : ""}`}
                  key={challenge.id}
                  aria-pressed={selectedChallenge.id === challenge.id}
                  onClick={() => onSelect(challenge)}
                >
                  <span className="challenge-card__meta"><strong>{challenge.category}</strong><small>{challenge.distanceNauticalMiles} NM</small></span>
                  <span className="challenge-card__title">{challenge.title}</span>
                  <span className="challenge-card__route">{routeLabel(challenge)}</span>
                  <span className="challenge-card__footer"><small>Cessna 172SP</small><small>Clear</small></span>
                </button>
              ))}
            </div>
          </section>
        </main>

        <aside className={`challenge-briefing challenge-theme--${selectedChallenge.theme}`} aria-label="Challenge briefing">
          <div className="challenge-briefing__image">
            <span>{selectedChallenge.category}</span>
            <h3>{selectedChallenge.title}</h3>
            <p>{selectedChallenge.description}</p>
          </div>
          <div className="challenge-briefing__summary">
            <span>Selected challenge</span>
            <strong>{routeLabel(selectedChallenge)}</strong>
            <small>Cessna 172SP · {selectedChallenge.timeLabel} · Clear · {selectedChallenge.distanceNauticalMiles} NM</small>
            <button type="button" className="challenge-start" disabled={busy} onClick={() => onStart(selectedChallenge)}>
              <PlaneTakeoff size={17} aria-hidden="true" /> Start challenge
            </button>
          </div>

          <dl className="challenge-briefing__facts">
            <div><dt>Aircraft</dt><dd>Cessna 172SP</dd></div>
            <div><dt>Time</dt><dd>{selectedChallenge.timeLabel}</dd></div>
            <div><dt>Conditions</dt><dd>Clear skies</dd></div>
            <div><dt>Distance</dt><dd>{selectedChallenge.distanceNauticalMiles} NM</dd></div>
          </dl>

          <section className="challenge-objectives">
            <h4><Flag size={13} aria-hidden="true" /> Objectives</h4>
            <ul>
              {selectedChallenge.objectives.map((objective) => <li key={objective}><Check size={12} aria-hidden="true" />{objective}</li>)}
            </ul>
          </section>

          <section className="challenge-legs">
            <h4><Route size={13} aria-hidden="true" /> ATC legs</h4>
            <ol>
              {selectedChallenge.legs.map((leg, index) => (
                <li key={leg.id}>
                  <span>{(index + 1).toString().padStart(2, "0")}</span>
                  <div><strong>{leg.title}</strong><p>{leg.instruction}</p></div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
