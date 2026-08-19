import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  CircleCheck,
  Compass,
  Flag,
  Gauge,
  LoaderCircle,
  MapPinned,
  Menu,
  Pause,
  Plane,
  Play,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  FLIGHT_CHALLENGES,
  challengeSpawnRequest,
  distanceToChallengeLeg,
  isChallengeLegComplete,
  type FlightChallenge,
} from "../challenges/challenges";
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
import { cameraModeLabel, nextCameraMode } from "../systems/CameraSystem";
import { ChallengesPanel } from "./ChallengesPanel";
import { ControlsPanel } from "./ControlsPanel";

const EMPTY_TELEMETRY: RuntimeTelemetry = {
  latitudeDegrees: DEFAULT_AIRBORNE_SPAWN.latitudeDegrees,
  longitudeDegrees: DEFAULT_AIRBORNE_SPAWN.longitudeDegrees,
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
  crashReason: "",
  landingStatus: "",
  fps: 0,
  paused: true,
  cameraMode: "chase",
  worldLabel: "Cesium world",
  quality: "medium",
  terrainReliable: false,
  daylight: {
    localHour: 12,
    daylight: 1,
    horizon: 0,
    phase: "day",
  },
};

const metersPerSecondToKnots = (value: number): number => value * 1.94384;
const metersToFeet = (value: number): number => value * 3.28084;
const metersPerSecondToFeetPerMinute = (value: number): number => value * 196.85;

const formatDaylightTime = (decimalHour: number): string => {
  const totalMinutes = Math.round(decimalHour * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

type FlightTransition = {
  phase: "idle" | "flying" | "loading";
  label: string;
};

type SetupView = "explore" | "challenges";

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
  const [shareStatus, setShareStatus] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [flightTransition, setFlightTransition] = useState<FlightTransition>({ phase: "idle", label: "" });
  const [setupView, setSetupView] = useState<SetupView>("explore");
  const [challengeFilter, setChallengeFilter] = useState<"all" | "featured">("all");
  const [selectedChallengeId, setSelectedChallengeId] = useState(FLIGHT_CHALLENGES[0].id);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [challengeLegIndex, setChallengeLegIndex] = useState(0);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const photorealisticEvaluation = telemetry.worldLabel.startsWith("Google photorealistic");
  const selectedChallenge = FLIGHT_CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ?? FLIGHT_CHALLENGES[0];
  const activeChallenge = FLIGHT_CHALLENGES.find((challenge) => challenge.id === activeChallengeId) ?? null;
  const activeChallengeLeg = activeChallenge?.legs[challengeLegIndex] ?? null;
  const activeLegDistance = activeChallengeLeg ? distanceToChallengeLeg(activeChallengeLeg, telemetry) : null;

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
        if (urlSpawn) {
          engine.enterFlightMode(true);
          setShowBriefing(false);
        } else {
          engine.enterExploreMode();
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

  const startFlight = async (spawn: SpawnRequest, label: string, airportCode?: string): Promise<boolean> => {
    const engine = engineRef.current;
    if (!engine) return false;
    setSearching(true);
    setSearchError("");
    setFlightTransition({ phase: "flying", label });
    try {
      await engine.flyExploreTo(spawn);
      setFlightTransition({ phase: "loading", label });
      await engine.prepareFlight(spawn);
      updateSpawnUrl(spawn, airportCode);
      engine.enterFlightMode(true);
      setShowBriefing(false);
      setShowControls(false);
      setShowSettings(false);
      engine.clearAirportMarkers();
      return true;
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "The selected location could not be loaded.");
      engine.enterExploreMode();
      return false;
    } finally {
      setSearching(false);
      setFlightTransition({ phase: "idle", label: "" });
    }
  };

  const openWorldIndex = () => {
    engineRef.current?.enterExploreMode();
    setSetupView(activeChallengeId ? "challenges" : "explore");
    setShowBriefing(true);
    setShowControls(false);
    setShowSettings(false);
    setShareStatus("");
  };

  const returnToFlight = () => {
    engineRef.current?.enterFlightMode(false);
    setShowBriefing(false);
    setShowControls(false);
    setShowSettings(false);
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPaused(!engine.isPaused());
  };

  const respawn = () => {
    engineRef.current?.respawn();
    if (activeChallengeId) {
      setChallengeLegIndex(0);
      setChallengeComplete(false);
    }
    setShowBriefing(false);
    setShowSettings(false);
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

  const setDaylightHour = (hour: number) => {
    engineRef.current?.setDaylightHour(hour);
  };

  useEffect(() => {
    if (!activeChallenge || !activeChallengeLeg || challengeComplete || telemetry.paused) return;
    if (!isChallengeLegComplete(activeChallengeLeg, telemetry)) return;
    if (challengeLegIndex >= activeChallenge.legs.length - 1) {
      setChallengeComplete(true);
      return;
    }
    setChallengeLegIndex((index) => index + 1);
  }, [activeChallenge, activeChallengeLeg, challengeComplete, challengeLegIndex, telemetry]);

  const clearActiveChallenge = () => {
    setActiveChallengeId(null);
    setChallengeLegIndex(0);
    setChallengeComplete(false);
  };

  const startChallenge = async (challenge: FlightChallenge) => {
    setSelectedChallengeId(challenge.id);
    engineRef.current?.setDaylightHour(challenge.localHour);
    const started = await startFlight(
      challengeSpawnRequest(challenge),
      `${challenge.title} · ${challenge.originLabel}`,
      challenge.originCode,
    );
    if (!started) return;
    setActiveChallengeId(challenge.id);
    setChallengeLegIndex(0);
    setChallengeComplete(false);
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
      const results = photorealisticEvaluation
        ? await engineRef.current?.searchPhotorealisticCities(query) ?? []
        : await searchCities(query);
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
    clearActiveChallenge();
    const spawn = spawnFromAirport(airport, spawnMode);
    void startFlight(spawn, `${airport.name} · ${airport.runway}`, airport.ident);
  };

  const selectCity = (city: GeocodingResult) => {
    clearActiveChallenge();
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
  const flightStateLabel = telemetry.crashed ? "Crashed" : telemetry.grounded ? "Ground" : "Airborne";
  const headingLabel = Math.round(telemetry.headingDegrees).toString().padStart(3, "0");

  return (
    <main className={`app-shell${showBriefing ? " is-menu-open" : ""}${flightTransition.phase !== "idle" ? " is-transitioning" : ""}`} onPointerDownCapture={unlockSound} onKeyDownCapture={unlockSound}>
      <div ref={containerRef} className="cesium-stage" aria-label="Interactive 3D flight world" />

      {status.phase !== "ready" && (
        <aside className={`world-status world-status--${status.phase}`} aria-live="polite">
          <div className="status-line">
            <span className="status-mark" aria-hidden="true" />
            <span>{status.phase === "loading" ? "Loading" : "Error"}</span>
          </div>
          <h2>{status.phase === "error" ? "Flight failed to start" : "Preparing aircraft"}</h2>
          <p>{status.message}</p>
          {status.fallbackReason && <p className="status-note">Fallback: {status.fallbackReason}</p>}
          {status.phase === "error" && <button type="button" className="primary-button status-retry" onClick={retry}>Retry</button>}
        </aside>
      )}

      {status.phase === "ready" && !showBriefing && (
        <>
          <button className="controls-toggle" type="button" onClick={() => setShowControls(true)}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Controls
          </button>

          <div className="camera-chip" aria-label={`Current camera: ${cameraModeLabel(telemetry.cameraMode)}`}>
            {cameraModeLabel(telemetry.cameraMode).toUpperCase()}
          </div>

          <section className="flight-hud" aria-label="Development flight telemetry">
            <div className="hud-column hud-column--left">
              <div className="primary-metric hud-metric hud-metric--large">
                <span>Speed</span><strong>{speedKnots}</strong><small>KTS</small>
              </div>
              <div className="primary-metric hud-metric hud-metric--large">
                <span>Altitude</span><strong>{altitudeMslFeet}</strong><small>FT</small>
              </div>
              <div className="hud-metric"><span>AGL</span><strong>{altitudeAglFeet}</strong><small>FT</small></div>
              <div className="hud-metric"><span>V/S</span><strong>{verticalSpeed > 0 ? "+" : ""}{verticalSpeed}</strong><small>FT/MIN</small></div>
            </div>

            <div className="hud-column hud-column--right">
              <div className="hud-metric"><span>Heading</span><strong>{headingLabel}</strong><small>DEG</small></div>
              <div className="hud-metric"><span>Throttle</span><strong>{Math.round(telemetry.throttle * 100)}</strong><small>%</small></div>
              <div className="hud-metric"><span>Flaps</span><strong>{Math.round(telemetry.flaps * 100)}</strong><small>%</small></div>
              <div className="hud-metric"><span>Brakes</span><strong>{telemetry.brakes > 0 ? "ON" : "OFF"}</strong></div>
              <div className="hud-metric"><span>State</span><strong>{flightStateLabel.toUpperCase()}</strong></div>
              <div className="hud-metric"><span>Render</span><strong>{Math.round(telemetry.fps)}</strong><small>FPS · {telemetry.quality}</small></div>
            </div>
          </section>

          <div className="hud-utility">
            <Sun size={14} aria-hidden="true" />
            <span>Local</span>
            <strong>{formatDaylightTime(telemetry.daylight.localHour)}</strong>
            <small>{telemetry.daylight.phase}</small>
          </div>

          {activeChallenge && (
            <aside className={`challenge-tracker${challengeComplete ? " is-complete" : ""}`} aria-label="Active challenge">
              <header>
                <div><Flag size={13} aria-hidden="true" /><span>{challengeComplete ? "Challenge complete" : activeChallenge.category}</span></div>
                <button type="button" onClick={clearActiveChallenge} aria-label="End challenge"><X size={15} aria-hidden="true" /></button>
              </header>
              <div className="challenge-tracker__title">
                <strong>{activeChallenge.title}</strong>
                <small>{activeChallenge.originCode} → {activeChallenge.destinationCode}</small>
              </div>
              {challengeComplete ? (
                <div className="challenge-tracker__complete">
                  <CircleCheck size={28} aria-hidden="true" />
                  <div><strong>Route complete</strong><span>Aircraft stopped at {activeChallenge.destinationLabel}.</span></div>
                </div>
              ) : activeChallengeLeg && (
                <>
                  <div className="challenge-tracker__progress" aria-label={`Leg ${challengeLegIndex + 1} of ${activeChallenge.legs.length}`}>
                    <span style={{ width: `${((challengeLegIndex + 1) / activeChallenge.legs.length) * 100}%` }} />
                  </div>
                  <div className="challenge-tracker__leg">
                    <span>{(challengeLegIndex + 1).toString().padStart(2, "0")} / {activeChallenge.legs.length.toString().padStart(2, "0")}</span>
                    <strong>{activeChallengeLeg.title}</strong>
                    <p>{activeChallengeLeg.instruction}</p>
                    {activeLegDistance !== null && <small>{activeLegDistance < 1 ? `${Math.round(activeLegDistance * 1_000)} m` : `${activeLegDistance.toFixed(1)} km`} to checkpoint</small>}
                  </div>
                </>
              )}
            </aside>
          )}

          <nav className="hud-actions" aria-label="Flight actions">
            <button type="button" onClick={toggleSound} aria-label={`Sound ${soundEnabled ? "on" : "off"}`} aria-pressed={soundEnabled}>
              {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
              <span>Sound</span>
            </button>
            <button type="button" onClick={cycleCamera} aria-label={`Next camera: ${cameraModeLabel(nextCameraMode(telemetry.cameraMode))}`}>
              <Camera aria-hidden="true" /><span>View</span>
            </button>
            <button type="button" onClick={() => setShowSettings((value) => !value)} aria-label="Settings" aria-expanded={showSettings}>
              <Settings aria-hidden="true" /><span>Settings</span>
            </button>
            <button type="button" onClick={togglePause} aria-label={telemetry.paused ? "Resume" : "Pause"}>
              {telemetry.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              <span>{telemetry.paused ? "Resume" : "Pause"}</span>
            </button>
            <button type="button" onClick={respawn} aria-label="Respawn">
              <RotateCcw aria-hidden="true" /><span>Respawn</span>
            </button>
            <button type="button" onClick={openWorldIndex} aria-label="World search">
              <Menu aria-hidden="true" /><span>Menu</span>
            </button>
          </nav>

          {showSettings && (
            <aside className="settings-popover" aria-label="Daylight time controls">
              <header>
                <div><Sun size={14} aria-hidden="true" /><span>Daylight</span></div>
                <button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={16} aria-hidden="true" /></button>
              </header>
              <div className="daylight-heading">
                <span>Local time</span>
                <strong>{formatDaylightTime(telemetry.daylight.localHour)}</strong>
                <small>{telemetry.daylight.phase}</small>
              </div>
              <label className="daylight-slider">
                <span className="sr-only">Local daylight hour</span>
                <input type="range" min="6" max="17.5" step="0.25" value={telemetry.daylight.localHour} onChange={(event) => setDaylightHour(Number(event.target.value))} />
                <span><small>06</small><small>09</small><small>12</small><small>15</small><small>17:30</small></span>
              </label>
              <div className="daylight-presets">
                <button type="button" onClick={() => setDaylightHour(6.5)}>Dawn</button>
                <button type="button" onClick={() => setDaylightHour(12)}>Noon</button>
                <button type="button" onClick={() => setDaylightHour(17.5)}>Sunset</button>
              </div>
            </aside>
          )}
        </>
      )}

      {!showBriefing && telemetry.crashed && (
        <section className="crash-panel" role="alert">
          <h2>{telemetry.crashReason === "building" ? "Building collision" : "Terrain impact"}</h2>
          <p>The aircraft has been stopped at the impact surface. Press R or use Respawn to restart from your selected location.</p>
          <button type="button" className="primary-button" onClick={respawn}>Respawn</button>
        </section>
      )}

      {!showBriefing && !telemetry.crashed && telemetry.landingStatus && (
        <section className={`landing-panel landing-panel--${telemetry.landingStatus}`} aria-live="polite">
          <strong>{telemetry.landingStatus === "smooth" ? "Smooth landing" : telemetry.landingStatus === "hard" ? "Hard landing" : "Severe landing"}</strong>
          <span>{telemetry.grounded ? "Brake to a complete stop." : "Keep flying."}</span>
        </section>
      )}

      {showBriefing && status.phase === "ready" && (
        <section className={`setup-layer${flightTransition.phase !== "idle" ? " setup-layer--transitioning" : ""}`} aria-label="World search and flight controls">
          <header className="setup-nav">
            <div className="setup-brand">
              <Plane size={34} aria-hidden="true" />
              <div><h1>Arcade Flight Simulator</h1><span>{telemetry.worldLabel}</span></div>
            </div>
            <div className="setup-primary-nav">
              <button type="button" className={setupView === "explore" ? "is-active" : ""} onClick={() => setSetupView("explore")}>Explore</button>
              <button type="button" className={setupView === "challenges" ? "is-active" : ""} onClick={() => setSetupView("challenges")}>Challenges</button>
              <span>Ring runs</span>
              <span>Career</span>
              <span>Hangar</span>
              <span>Gallery</span>
            </div>
            <nav aria-label="Setup actions">
              <button type="button" onClick={toggleSound} aria-label={`Sound ${soundEnabled ? "on" : "off"}`} aria-pressed={soundEnabled}>
                {soundEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />} Sound
              </button>
              <button type="button" onClick={() => setShowControls(true)}><SlidersHorizontal size={15} aria-hidden="true" /> Controls</button>
              <button type="button" onClick={returnToFlight} aria-label="Close"><X size={17} aria-hidden="true" /></button>
            </nav>
          </header>

          {setupView === "explore" ? (
          <div className="setup-scroll">
            <section className="setup-intro">
              <span>Explore</span>
              <h2 aria-label="Choose the world">Fly <em>anywhere</em> on Earth</h2>
              <p>Search any airport, city, or code, then take off from the runway or begin at 1,000 ft AGL.</p>
              <button type="button" onClick={() => setShowControls(true)}><SlidersHorizontal size={15} aria-hidden="true" /> Controls</button>
            </section>

            <div className="setup-grid">
              <aside className="aircraft-card" aria-label="Active aircraft">
                <div className="aircraft-card__stage">
                  <img src="/assets/aircraft/cessna-172sp-preview.png" alt="Cessna 172SP aircraft preview" />
                </div>
                <div className="aircraft-card__body">
                  <h3>Cessna 172SP</h3>
                  <p>High-wing trainer</p>
                  <dl>
                    <div><dt>Speed</dt><dd>122 <small>kt cruise</small></dd></div>
                    <div><dt>Engine</dt><dd>180 <small>HP</small></dd></div>
                    <div><dt>Stall</dt><dd>48 <small>kt</small></dd></div>
                    <div><dt>Ceiling</dt><dd>14,000 <small>ft</small></dd></div>
                  </dl>
                </div>
              </aside>

              <section className="flight-setup">
                <form className="location-search" onSubmit={(event) => void submitSearch(event)}>
                  <Search size={18} aria-hidden="true" />
                  <label className="sr-only" htmlFor="world-query">{searchKind === "airport" ? "Airport name, ICAO, or IATA" : "City name"}</label>
                  <input id="world-query" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder={searchKind === "airport" ? "Search airport, ICAO, or IATA…" : "Search any city…"} />
                  <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
                </form>

                <div className="flight-setup__card">
                  <div className="flight-setup__heading">
                    <div><span>Flight setup</span><strong>{formatDaylightTime(telemetry.daylight.localHour)} · {spawnMode === "runway" ? "Runway" : "Air start"}</strong></div>
                    <ChevronDown size={18} aria-hidden="true" />
                  </div>

                  <span className="field-label">Start mode</span>
                  <div className="spawn-mode" aria-label="Airport spawn mode">
                    <button type="button" aria-pressed={spawnMode === "runway"} onClick={() => setSpawnMode("runway")}><strong>RWY</strong><span>Runway</span></button>
                    <button type="button" aria-pressed={spawnMode === "air"} onClick={() => setSpawnMode("air")}><strong>AIR</strong><span>Airborne</span></button>
                  </div>

                  <div className="quick-starts">
                    <button type="button" onClick={() => { clearActiveChallenge(); void startFlight(DEFAULT_RUNWAY_SPAWN, "Dubai International · 12R", "OMDB"); }} disabled={searching}>Dubai runway</button>
                    <button type="button" className="takeoff-button" onClick={() => { clearActiveChallenge(); void startFlight(DEFAULT_AIRBORNE_SPAWN, "Dubai International · airborne", "OMDB"); }} disabled={searching}><Plane size={17} aria-hidden="true" /> Dubai airborne</button>
                  </div>

                  <div className="share-row">
                    <button type="button" onClick={() => void copyShareLink()}><MapPinned size={14} aria-hidden="true" /> Copy current spawn link</button>
                    <span aria-live="polite">{shareStatus}</span>
                  </div>
                </div>
              </section>

              <aside className="destinations-panel">
                <header><div><Compass size={17} aria-hidden="true" /><span>Destinations</span></div><small>{airportResults.length || cityResults.length} shown</small></header>
                <div className="search-tabs" role="tablist" aria-label="Location search type">
                  <button type="button" role="tab" aria-selected={searchKind === "airport"} onClick={() => chooseSearchKind("airport")}><Gauge size={13} aria-hidden="true" /> Airports</button>
                  <button type="button" role="tab" aria-selected={searchKind === "city"} onClick={() => chooseSearchKind("city")}><MapPinned size={13} aria-hidden="true" /> Cities</button>
                </div>
                {searchError && <p className="search-error" role="alert">{searchError}</p>}
                <div className="search-results" aria-label="Location search results">
                  {searchKind === "airport" && airportResults.map((airport, index) => (
                    <button type="button" key={airport.ident} onClick={() => selectAirport(airport)} disabled={searching}>
                      <span className="result-rank">{index + 1}</span>
                      <strong>{airport.iata || airport.ident}</strong>
                      <span>{airport.name}</span>
                      <small>{airport.municipality || airport.country} · RWY {airport.runway} · {Math.round(airport.lengthFeet).toLocaleString()} ft</small>
                    </button>
                  ))}
                  {searchKind === "city" && cityResults.map((city, index) => (
                    <button type="button" key={city.id} onClick={() => selectCity(city)} disabled={searching}>
                      <span className="result-rank">{index + 1}</span>
                      <strong>{city.label.split(",")[0]}</strong>
                      <span>{city.label}</span>
                      <small>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)} · airborne</small>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </div>
          ) : (
            <div className="setup-scroll setup-scroll--challenges">
              <ChallengesPanel
                selectedChallenge={selectedChallenge}
                filter={challengeFilter}
                busy={searching}
                onFilterChange={setChallengeFilter}
                onSelect={(challenge) => setSelectedChallengeId(challenge.id)}
                onStart={(challenge) => void startChallenge(challenge)}
              />
            </div>
          )}

          <nav className="setup-mobile-nav" aria-label="Mobile setup navigation">
            <button type="button" aria-current={setupView === "explore" ? "page" : undefined} onClick={() => setSetupView("explore")}><Compass aria-hidden="true" /><span>Explore</span></button>
            <button type="button" aria-current={setupView === "challenges" ? "page" : undefined} onClick={() => setSetupView("challenges")}><Flag aria-hidden="true" /><span>Challenges</span></button>
            <button type="button" onClick={() => setShowControls(true)}><SlidersHorizontal aria-hidden="true" /><span>Controls</span></button>
            <button type="button" onClick={returnToFlight}><Play aria-hidden="true" /><span>Fly</span></button>
          </nav>
        </section>
      )}

      {flightTransition.phase !== "idle" && (
        <section className={`flight-transition flight-transition--${flightTransition.phase}`} role="status" aria-live="polite">
          {flightTransition.phase === "flying" ? (
            <div className="flight-transition__target">
              <MapPinned size={16} aria-hidden="true" />
              <span>Flying to</span>
              <strong>{flightTransition.label}</strong>
            </div>
          ) : (
            <div className="flight-loading-card">
              <Plane size={38} aria-hidden="true" />
              <span>Arcade Flight Simulator</span>
              <h2>Preparing your flight</h2>
              <p>{flightTransition.label}</p>
              <div className="flight-loading-card__status">
                <LoaderCircle size={16} aria-hidden="true" />
                <span>Streaming terrain and airport data</span>
              </div>
              <div className="flight-loading-card__progress" aria-hidden="true"><span /></div>
            </div>
          )}
        </section>
      )}

      {!showBriefing && telemetry.paused && status.phase === "ready" && (
        <section className="pause-panel" aria-label="Flight paused"><strong>Paused</strong><span>Press Esc or select Resume.</span></section>
      )}

      {showControls && <ControlsPanel onClose={() => setShowControls(false)} />}

      <div className="provider-credit">Cessna 172SP · {photorealisticEvaluation ? "photorealistic scenery" : "OSM scenery"}</div>
    </main>
  );
}

export default App;
