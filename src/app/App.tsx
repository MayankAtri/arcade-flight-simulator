import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Airport } from "../data/types";
import { FLIGHT_TUNING } from "../flight/tuning";
import type { SpawnRequest } from "../flight/types";
import { findAirport, searchAirports } from "../services/AirportService";
import { searchCities, type GeocodingResult } from "../services/GeocodingService";
import { parseSpawnUrl, spawnFromAirport, updateSpawnUrl } from "../services/SpawnUrlService";
import {
  DEFAULT_AIRBORNE_SPAWN,
  DEFAULT_RUNWAY_SPAWN,
  SimulationEngine,
  type EngineStatus,
  type RuntimeTelemetry,
} from "../systems/SimulationEngine";

const EMPTY_TELEMETRY: RuntimeTelemetry = {
  airspeedMetersPerSecond: 0,
  altitudeMslMeters: 0,
  altitudeAglMeters: 0,
  headingDegrees: 0,
  verticalSpeedMetersPerSecond: 0,
  throttle: 0,
  brakes: 0,
  flaps: 0,
  grounded: false,
  crashed: false,
  landingStatus: "",
  fps: 0,
  paused: true,
  cameraMode: "chase",
  worldLabel: "Cesium world",
  quality: "medium",
  terrainReliable: false,
};

const metersPerSecondToKnots = (value: number): number => value * 1.94384;
const metersToFeet = (value: number): number => value * 3.28084;
const metersPerSecondToFeetPerMinute = (value: number): number => value * 196.85;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ phase: "loading", message: "Loading flight systems…" });
  const [telemetry, setTelemetry] = useState<RuntimeTelemetry>(EMPTY_TELEMETRY);
  const [showBriefing, setShowBriefing] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [searchKind, setSearchKind] = useState<"airport" | "city">("airport");
  const [spawnMode, setSpawnMode] = useState<"runway" | "air">("runway");
  const [query, setQuery] = useState("");
  const [airportResults, setAirportResults] = useState<Airport[]>(() => searchAirports("", 6));
  const [cityResults, setCityResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [spawnLabel, setSpawnLabel] = useState("Dubai International · 12R");
  const [shareStatus, setShareStatus] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const photorealisticEvaluation = telemetry.worldLabel.startsWith("Google photorealistic");

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const engine = new SimulationEngine(containerRef.current, {
      onTelemetry: (next) => {
        if (!cancelled) setTelemetry(next);
      },
      onStatus: (next) => {
        if (!cancelled) setStatus(next);
      },
      onMenuRequested: () => {
        if (!cancelled) setShowBriefing(true);
      },
    });
    engineRef.current = engine;

    void engine
      .initialize()
      .then(async () => {
        if (cancelled) return;
        const urlSpawn = parseSpawnUrl(window.location.search, findAirport);
        const initialSpawn = urlSpawn ?? DEFAULT_AIRBORNE_SPAWN;
        await engine.spawnAt(initialSpawn);
        if (cancelled) return;
        engine.setPaused(true);
        if (urlSpawn) setShowBriefing(false);
        const airportCode = new URLSearchParams(window.location.search).get("airport");
        if (airportCode) {
          const airport = findAirport(airportCode);
          if (airport) setSpawnLabel(`${airport.name} · ${airport.runway}`);
        } else if (urlSpawn) {
          setSpawnLabel(`${urlSpawn.latitudeDegrees.toFixed(3)}, ${urlSpawn.longitudeDegrees.toFixed(3)}`);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({
          phase: "error",
          message: error instanceof Error ? error.message : "Flight systems could not start.",
        });
      });

    return () => {
      cancelled = true;
      engine.destroy();
      engineRef.current = null;
    };
  }, [attempt]);

  const startFlight = async (spawn: SpawnRequest, label: string, airportCode?: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    setSearching(true);
    setSearchError("");
    try {
      await engine.spawnAt(spawn);
      updateSpawnUrl(spawn, airportCode);
      setSpawnLabel(label);
      setShowBriefing(false);
      engine.clearAirportMarkers();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "The selected location could not be loaded.");
    } finally {
      setSearching(false);
    }
  };

  const openWorldIndex = () => {
    engineRef.current?.setPaused(true);
    setShowBriefing(true);
    setShareStatus("");
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPaused(!engine.isPaused());
  };

  const respawn = () => {
    engineRef.current?.respawn();
    setShowBriefing(false);
  };

  const cycleCamera = () => engineRef.current?.cycleCamera();

  const unlockSound = () => {
    if (soundEnabled) void engineRef.current?.unlockAudio();
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    engineRef.current?.setSoundEnabled(next);
    if (next) void engineRef.current?.unlockAudio();
  };

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchError("");
    setShareStatus("");
    if (searchKind === "airport") {
      const results = searchAirports(query, 10);
      setAirportResults(results);
      setCityResults([]);
      engineRef.current?.showAirportMarkers(results);
      if (!results.length) setSearchError("No airports matched that name or code.");
      return;
    }
    if (query.trim().length < 2) {
      setSearchError("Enter at least two characters and submit the city search.");
      return;
    }
    setSearching(true);
    try {
      const results = await searchCities(query);
      setCityResults(results);
      setAirportResults([]);
      engineRef.current?.clearAirportMarkers();
      if (!results.length) setSearchError("No city results were returned.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "City search is temporarily unavailable.");
    } finally {
      setSearching(false);
    }
  };

  const selectAirport = (airport: Airport) => {
    const spawn = spawnFromAirport(airport, spawnMode);
    void startFlight(spawn, `${airport.name} · ${airport.runway}`, airport.ident);
  };

  const selectCity = (city: GeocodingResult) => {
    const spawn: SpawnRequest = {
      latitudeDegrees: city.latitude,
      longitudeDegrees: city.longitude,
      elevationMeters: 0,
      headingDegrees: 0,
      mode: "air",
      airborneAltitudeMeters: FLIGHT_TUNING.defaultAirborneSpawnAltitudeMeters,
    };
    void startFlight(spawn, city.label);
  };

  const chooseSearchKind = (kind: "airport" | "city") => {
    if (kind === "city" && photorealisticEvaluation) return;
    setSearchKind(kind);
    setSearchError("");
    setShareStatus("");
    if (kind === "city") {
      setSpawnMode("air");
      engineRef.current?.clearAirportMarkers();
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Copy the current address from your browser");
    }
  };

  const speedKnots = Math.round(metersPerSecondToKnots(telemetry.airspeedMetersPerSecond));
  const altitudeAglFeet = Math.round(metersToFeet(telemetry.altitudeAglMeters));
  const altitudeMslFeet = Math.round(metersToFeet(telemetry.altitudeMslMeters));
  const verticalSpeed = Math.round(metersPerSecondToFeetPerMinute(telemetry.verticalSpeedMetersPerSecond));

  return (
    <main className="app-shell" onPointerDownCapture={unlockSound} onKeyDownCapture={unlockSound}>
      <div ref={containerRef} className="cesium-stage" aria-label="Interactive 3D flight world" />

      <header className="masthead">
        <div>
          <p className="project-index">04</p>
          <h1>Arcade Flight Simulator</h1>
        </div>
        <div className="masthead-actions">
          <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} title="Engine, wind, ground, and impact audio">
            Sound {soundEnabled ? "on" : "off"}
          </button>
          <button type="button" onClick={openWorldIndex} disabled={status.phase !== "ready"}>World search</button>
          <button type="button" onClick={cycleCamera} disabled={status.phase !== "ready"}>
            {telemetry.cameraMode === "chase" ? "Cockpit view" : "Chase view"}
          </button>
          <button type="button" onClick={togglePause} disabled={status.phase !== "ready"}>
            {telemetry.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={respawn} disabled={status.phase !== "ready"}>Respawn</button>
        </div>
      </header>

      <aside className={`world-status world-status--${status.phase}`} aria-live="polite">
        <div className="status-line">
          <span className="status-mark" aria-hidden="true" />
          <span>
            {status.phase === "loading" ? "Loading" : status.phase === "error" ? "Error" : telemetry.crashed ? "Crashed" : telemetry.grounded ? "Grounded" : "Flying"}
          </span>
          <span className="provider-name">{telemetry.worldLabel}</span>
        </div>
        <h2>{status.phase === "ready" ? spawnLabel : status.phase === "error" ? "Flight failed to start" : "Preparing aircraft"}</h2>
        <p>{status.phase === "ready" ? "Worldwide spawn · fixed 60 Hz physics · global ECEF position" : status.message}</p>
        {status.fallbackReason && <p className="status-note">Fallback: {status.fallbackReason}</p>}
        {status.phase === "error" && <button type="button" className="primary-button status-retry" onClick={retry}>Retry</button>}
      </aside>

      <section className="flight-strip" aria-label="Development flight telemetry">
        <div className="primary-metric"><span>Airspeed</span><strong>{speedKnots}</strong><small>knots</small></div>
        <div className="primary-metric"><span>Altitude</span><strong>{altitudeAglFeet}</strong><small>ft AGL · {altitudeMslFeet} MSL</small></div>
        <dl className="secondary-metrics">
          <div><dt>Heading</dt><dd>{Math.round(telemetry.headingDegrees).toString().padStart(3, "0")}°</dd></div>
          <div><dt>Vertical speed</dt><dd>{verticalSpeed > 0 ? "+" : ""}{verticalSpeed} ft/min</dd></div>
          <div><dt>Throttle</dt><dd>{Math.round(telemetry.throttle * 100)}%</dd></div>
          <div><dt>Flaps</dt><dd>{Math.round(telemetry.flaps * 100)}%</dd></div>
          <div><dt>Brakes</dt><dd>{telemetry.brakes > 0 ? "ON" : "OFF"}</dd></div>
          <div><dt>State</dt><dd>{telemetry.crashed ? "CRASHED" : telemetry.grounded ? "GROUND" : "AIRBORNE"}</dd></div>
          <div><dt>Camera</dt><dd>{telemetry.cameraMode.toUpperCase()}</dd></div>
          <div><dt>Render</dt><dd>{Math.round(telemetry.fps)} FPS · {telemetry.quality}</dd></div>
        </dl>
      </section>

      {telemetry.crashed && (
        <section className="crash-panel" role="alert">
          <h2>Aircraft stopped</h2>
          <p>Press R or use Respawn to restart from your selected location.</p>
          <button type="button" className="primary-button" onClick={respawn}>Respawn</button>
        </section>
      )}

      {!telemetry.crashed && telemetry.landingStatus && (
        <section className={`landing-panel landing-panel--${telemetry.landingStatus}`} aria-live="polite">
          <strong>{telemetry.landingStatus === "smooth" ? "Smooth landing" : telemetry.landingStatus === "hard" ? "Hard landing" : "Severe landing"}</strong>
          <span>{telemetry.grounded ? "Brake to a complete stop." : "Keep flying."}</span>
        </section>
      )}

      {showBriefing && status.phase === "ready" && (
        <section className="briefing briefing--world" aria-label="World search and flight controls">
          <div className="briefing-copy">
            <p className="briefing-index">DAYS 08–10</p>
            <h2>Choose the world</h2>
            <p>Search an airport by name, ICAO, or IATA, or submit a city search. Airport starts support the selected runway or 1,000 ft AGL; city starts are airborne.</p>
            <div className="control-grid control-grid--compact">
              <div><kbd>W</kbd><kbd>S</kbd><span>Pitch</span></div>
              <div><kbd>Q</kbd><kbd>E</kbd><span>Roll</span></div>
              <div><kbd>A</kbd><kbd>D</kbd><span>Steer / yaw</span></div>
              <div><kbd>F</kbd><span>Flaps</span></div>
              <div><kbd>B</kbd><span>Brakes</span></div>
              <div><kbd>V</kbd><span>Camera</span></div>
            </div>
            <div className="quick-starts">
              <button type="button" onClick={() => void startFlight(DEFAULT_RUNWAY_SPAWN, "Dubai International · 12R", "OMDB")} disabled={searching}>Dubai runway</button>
              <button type="button" onClick={() => void startFlight(DEFAULT_AIRBORNE_SPAWN, "Dubai International · airborne", "OMDB")} disabled={searching}>Dubai airborne</button>
            </div>
          </div>

          <div className="world-index">
            <div className="search-tabs" role="tablist" aria-label="Location search type">
              <button type="button" role="tab" aria-selected={searchKind === "airport"} onClick={() => chooseSearchKind("airport")}>Airports</button>
              <button type="button" role="tab" aria-selected={searchKind === "city"} onClick={() => chooseSearchKind("city")} disabled={photorealisticEvaluation} title={photorealisticEvaluation ? "This one-shot Google tiles evaluation does not use Nominatim." : undefined}>Cities</button>
            </div>
            <form className="location-search" onSubmit={(event) => void submitSearch(event)}>
              <label htmlFor="world-query">{searchKind === "airport" ? "Airport name, ICAO, or IATA" : "City name"}</label>
              <div>
                <input id="world-query" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder={searchKind === "airport" ? "e.g. JFK, Heathrow, Tokyo" : "e.g. Cape Town"} />
                <button type="submit" className="primary-button" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
              </div>
            </form>
            {searchKind === "airport" && (
              <div className="spawn-mode" aria-label="Airport spawn mode">
                <button type="button" aria-pressed={spawnMode === "runway"} onClick={() => setSpawnMode("runway")}>Runway</button>
                <button type="button" aria-pressed={spawnMode === "air"} onClick={() => setSpawnMode("air")}>1,000 ft AGL</button>
              </div>
            )}
            {searchError && <p className="search-error" role="alert">{searchError}</p>}
            <div className="search-results" aria-label="Location search results">
              {searchKind === "airport" && airportResults.map((airport) => (
                <button type="button" key={airport.ident} onClick={() => selectAirport(airport)} disabled={searching}>
                  <strong>{airport.iata || airport.ident}</strong>
                  <span>{airport.name}</span>
                  <small>{airport.municipality || airport.country} · RWY {airport.runway} · {Math.round(airport.lengthFeet).toLocaleString()} ft</small>
                </button>
              ))}
              {searchKind === "city" && cityResults.map((city) => (
                <button type="button" key={city.id} onClick={() => selectCity(city)} disabled={searching}>
                  <strong>{city.label.split(",")[0]}</strong>
                  <span>{city.label}</span>
                  <small>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)} · airborne</small>
                </button>
              ))}
            </div>
            <div className="share-row">
              <button type="button" onClick={() => void copyShareLink()}>Copy current spawn link</button>
              <span aria-live="polite">{shareStatus}</span>
            </div>
          </div>
        </section>
      )}

      {!showBriefing && telemetry.paused && status.phase === "ready" && (
        <section className="pause-panel" aria-label="Flight paused"><strong>Paused</strong><span>Press Esc or select Resume.</span></section>
      )}

      <footer className="app-footer">
        <span>Cessna 172SP · terrain collision · procedural flight audio · {photorealisticEvaluation ? "photorealistic scenery" : "OSM scenery"}</span>
        <span>W/S or ↑/↓ pitch · Q/E or ←/→ roll · A/D steer/yaw · F flaps · B brakes · M world search</span>
      </footer>
    </main>
  );
}

export default App;
