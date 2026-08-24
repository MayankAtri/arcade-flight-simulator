import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Compass,
  Flag,
  Gauge,
  GraduationCap,
  Link2,
  LoaderCircle,
  MapPinned,
  Menu,
  Pause,
  Plane,
  Play,
  RotateCw,
  RotateCcw,
  Route,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Target,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  exitActivity,
  FREE_FLIGHT_ACTIVITY,
  setActivityPhase,
  startActivity,
  type ActivitySession,
} from "../activities/activity";
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
import {
  beginLessonRun,
  distanceToTrainingGate,
  evaluateLessonRun,
  lessonStepProgress,
  restartLessonAtCheckpoint,
  restartLessonStep,
  type LessonRunState,
} from "../flight-school/evaluator";
import { FLIGHT_LESSONS } from "../flight-school/lessons";
import { lessonLiveReadout } from "../flight-school/readout";
import {
  completeFlightLesson,
  loadFlightSchoolProgress,
  resetFlightSchoolProgress,
  saveFlightSchoolProgress,
} from "../flight-school/progress";
import type { FlightLesson } from "../flight-school/types";
import { RING_COURSES } from "../ring-runs/courses";
import {
  loadRingRunProgress,
  recordRingRunTime,
  resetRingRunProgress,
  saveRingRunProgress,
} from "../ring-runs/progress";
import type { RingCourse } from "../ring-runs/types";
import { findAirport, searchAirports } from "../services/AirportService";
import { searchCities, type GeocodingResult } from "../services/GeocodingService";
import { parseSpawnUrl, parseWeatherPreset, spawnFromAirport, updateSpawnUrl } from "../services/SpawnUrlService";
import {
  DEFAULT_AIRBORNE_SPAWN,
  SimulationEngine,
  type EngineStatus,
  type RuntimeTelemetry,
} from "../systems/SimulationEngine";
import { cameraModeLabel, nextCameraMode } from "../systems/CameraSystem";
import { ChallengesPanel } from "./ChallengesPanel";
import { ControlsPanel } from "./ControlsPanel";
import { FlightSchoolPanel } from "./FlightSchoolPanel";
import { AttitudeIndicator, CompassTape, formatCompassHeading } from "./HudInstruments";
import {
  MobileFlightControls,
  mobileControlLabel,
  mobileInstructionText,
  useCoarsePointer,
  usePortraitOrientation,
} from "./MobileFlightControls";
import { RingRunsPanel } from "./RingRunsPanel";
import { RingRunTracker } from "./RingRunTracker";
import { formatNonNegativeFeet } from "./telemetryFormatting";
import type { WeatherPreset } from "../world/types";

const EMPTY_TELEMETRY: RuntimeTelemetry = {
  latitudeDegrees: DEFAULT_AIRBORNE_SPAWN.latitudeDegrees,
  longitudeDegrees: DEFAULT_AIRBORNE_SPAWN.longitudeDegrees,
  airspeedMetersPerSecond: 0,
  altitudeMslMeters: 0,
  altitudeAglMeters: 0,
  headingDegrees: 0,
  pitchDegrees: 0,
  bankDegrees: 0,
  verticalSpeedMetersPerSecond: 0,
  throttle: 0,
  brakes: 0,
  flaps: 0,
  grounded: false,
  crashed: false,
  crashReason: "",
  landingStatus: "",
  stalled: false,
  fps: 0,
  paused: true,
  cameraMode: "chase",
  worldLabel: "Cesium world",
  quality: "medium",
  terrainReliable: false,
  daylight: {
    localHour: 12,
    solarElevationRadians: Math.PI / 2,
    daylight: 1,
    horizon: 0,
    highSun: 1,
    phase: "day",
  },
  weatherPreset: "clear",
  simulationTimeSeconds: 0,
  ringRun: null,
};

const metersPerSecondToKnots = (value: number): number => value * 1.94384;
const metersPerSecondToFeetPerMinute = (value: number): number => value * 196.85;

const DAYLIGHT_PRESETS = [
  { id: "sunrise", label: "Sunrise", localHour: 6.5 },
  { id: "noon", label: "Noon", localHour: 12 },
  { id: "sunset", label: "Sunset", localHour: 17.5 },
] as const;

const daylightPresetForHour = (localHour: number) => DAYLIGHT_PRESETS.reduce((closest, preset) => (
  Math.abs(preset.localHour - localHour) < Math.abs(closest.localHour - localHour) ? preset : closest
));

const WEATHER_PRESETS: ReadonlyArray<{ id: WeatherPreset; label: string }> = [
  { id: "clear", label: "Clear" },
  { id: "scattered", label: "Scattered" },
  { id: "cloudy", label: "Cloudy" },
];

const weatherPresetLabel = (preset: WeatherPreset): string => (
  WEATHER_PRESETS.find((option) => option.id === preset)?.label ?? "Clear"
);

type FlightTransition = {
  phase: "idle" | "flying" | "loading";
  label: string;
};

type SetupView = "explore" | "flight-school" | "challenges" | "ring-runs";

type SelectedPlace =
  | { kind: "airport"; airport: Airport; label: string; secondary: string }
  | { kind: "city"; city: GeocodingResult; label: string; secondary: string };

const POPULAR_DESTINATIONS = [
  { id: "helsinki", label: "Helsinki", country: "Finland", latitude: 60.1699, longitude: 24.9384, visits: "5,303" },
  { id: "matterhorn", label: "Matterhorn", country: "Switzerland", latitude: 45.9763, longitude: 7.6586, visits: "451" },
  { id: "lisbon", label: "Lisbon", country: "Portugal", latitude: 38.7223, longitude: -9.1393, visits: "435" },
  { id: "new-york", label: "New York", country: "United States", latitude: 40.7128, longitude: -74.006, visits: "381" },
  { id: "paris", label: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, visits: "138" },
  { id: "tehran", label: "Tehran", country: "Iran", latitude: 35.6892, longitude: 51.389, visits: "130" },
  { id: "dubai", label: "Dubai", country: "United Arab Emirates", latitude: 25.2048, longitude: 55.2708, visits: "60" },
  { id: "monaco", label: "Monaco", country: "Monaco", latitude: 43.7384, longitude: 7.4246, visits: "43" },
] satisfies Array<GeocodingResult & { country: string; visits: string }>;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setupScrollRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ phase: "loading", message: "Loading flight systems…" });
  const [telemetry, setTelemetry] = useState<RuntimeTelemetry>(EMPTY_TELEMETRY);
  const [mobileControlResetKey, setMobileControlResetKey] = useState(0);
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
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [setupHour, setSetupHour] = useState(12);
  const [setupWeather, setSetupWeather] = useState<WeatherPreset>(() => parseWeatherPreset(window.location.search));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [flightTransition, setFlightTransition] = useState<FlightTransition>({ phase: "idle", label: "" });
  const [setupView, setSetupView] = useState<SetupView>("explore");
  const [challengeFilter, setChallengeFilter] = useState<"all" | "featured">("all");
  const [selectedChallengeId, setSelectedChallengeId] = useState(FLIGHT_CHALLENGES[0].id);
  const [challengeLegIndex, setChallengeLegIndex] = useState(0);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [activity, setActivity] = useState<ActivitySession>(FREE_FLIGHT_ACTIVITY);
  const [selectedLessonId, setSelectedLessonId] = useState(FLIGHT_LESSONS[0].id);
  const [selectedCourseId, setSelectedCourseId] = useState(RING_COURSES[0].id);
  const [lessonRun, setLessonRun] = useState<LessonRunState | null>(null);
  const [lessonTrackerExpanded, setLessonTrackerExpanded] = useState(false);
  const [schoolProgress, setSchoolProgress] = useState(loadFlightSchoolProgress);
  const [ringRunProgress, setRingRunProgress] = useState(loadRingRunProgress);
  const [newRingRunBest, setNewRingRunBest] = useState(false);
  const lessonCueKeyRef = useRef("");
  const ringRunCueKeyRef = useRef("");
  const ringRunGateRef = useRef(0);
  const checkpointRestartRef = useRef(false);
  const coarsePointer = useCoarsePointer();
  const portraitOrientation = usePortraitOrientation();
  const mobilePortraitBlocked = coarsePointer && portraitOrientation && status.phase === "ready" && !showBriefing;
  const photorealisticEvaluation = telemetry.worldLabel.startsWith("Google photorealistic");
  const activeChallengeId = activity.mode === "challenge" ? activity.activityId : null;
  const activeLessonId = activity.mode === "lesson" ? activity.activityId : null;
  const activeRingRunId = activity.mode === "ring-run" ? activity.activityId : null;
  const selectedChallenge = FLIGHT_CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ?? FLIGHT_CHALLENGES[0];
  const activeChallenge = FLIGHT_CHALLENGES.find((challenge) => challenge.id === activeChallengeId) ?? null;
  const activeChallengeLeg = activeChallenge?.legs[challengeLegIndex] ?? null;
  const activeLegDistance = activeChallengeLeg ? distanceToChallengeLeg(activeChallengeLeg, telemetry) : null;
  const selectedLesson = FLIGHT_LESSONS.find((lesson) => lesson.id === selectedLessonId) ?? FLIGHT_LESSONS[0];
  const activeLesson = FLIGHT_LESSONS.find((lesson) => lesson.id === activeLessonId) ?? null;
  const selectedCourse = RING_COURSES.find((course) => course.id === selectedCourseId) ?? RING_COURSES[0];
  const activeRingCourse = RING_COURSES.find((course) => course.id === activeRingRunId) ?? null;
  const activeRingSnapshot = activeRingCourse && telemetry.ringRun?.courseId === activeRingCourse.id ? telemetry.ringRun : null;
  const activeLessonStep = activeLesson && lessonRun ? activeLesson.steps[lessonRun.stepIndex] ?? null : null;
  const activeGateDistance = activeLesson && activeLessonStep
    ? distanceToTrainingGate(activeLesson, activeLessonStep, telemetry)
    : null;

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const setTouchAxes = useCallback((pitch: number, roll: number) => engineRef.current?.setTouchAxes(pitch, roll), []);
  const setTouchYaw = useCallback((yaw: number) => engineRef.current?.setTouchYaw(yaw), []);
  const setTouchThrottle = useCallback((throttle: number) => engineRef.current?.setTouchThrottle(throttle), []);
  const setTouchBrake = useCallback((pressed: boolean) => engineRef.current?.setTouchBrake(pressed), []);
  const cycleTouchFlaps = useCallback(() => engineRef.current?.cycleFlaps(), []);
  const releaseTouchControls = useCallback(() => engineRef.current?.releaseTouchControls(), []);

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
        const urlWeather = parseWeatherPreset(window.location.search);
        engine.setWeatherPreset(urlWeather);
        const initialSpawn = urlSpawn ?? DEFAULT_AIRBORNE_SPAWN;
        await engine.spawnAt(initialSpawn);
        if (cancelled) return;
        setMobileControlResetKey((value) => value + 1);
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

  useEffect(() => {
    if (!mobilePortraitBlocked) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.releaseTouchControls();
    if (!engine.isPaused()) {
      engine.setPaused(true);
      setActivity((current) => setActivityPhase(current, "paused"));
    }
    setShowControls(false);
    setShowSettings(false);
  }, [mobilePortraitBlocked]);

  const startFlight = async (
    spawn: SpawnRequest,
    label: string,
    airportCode?: string,
    weatherPreset: WeatherPreset = setupWeather,
  ): Promise<boolean> => {
    const engine = engineRef.current;
    if (!engine) return false;
    setSearching(true);
    setSearchError("");
    setFlightTransition({ phase: "flying", label });
    try {
      engine.setWeatherPreset(weatherPreset);
      await engine.flyExploreTo(spawn);
      setFlightTransition({ phase: "loading", label });
      await engine.prepareFlight(spawn);
      updateSpawnUrl(spawn, airportCode, weatherPreset);
      engine.enterFlightMode(true);
      setMobileControlResetKey((value) => value + 1);
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
    setActivity((current) => setActivityPhase(current, "paused"));
    setSetupView(activeRingRunId ? "ring-runs" : activeLessonId ? "flight-school" : activeChallengeId ? "challenges" : "explore");
    setShowBriefing(true);
    setShowControls(false);
    setShowSettings(false);
    setShareStatus("");
  };

  const returnToFlight = () => {
    engineRef.current?.enterFlightMode(false);
    setActivity((current) => setActivityPhase(current, "paused"));
    setShowBriefing(false);
    setShowControls(false);
    setShowSettings(false);
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const paused = !engine.isPaused();
    engine.setPaused(paused);
    setActivity((current) => setActivityPhase(current, paused ? "paused" : "active"));
  };

  const respawn = () => {
    engineRef.current?.respawn();
    setMobileControlResetKey((value) => value + 1);
    setActivity((current) => setActivityPhase(current, "active"));
    if (activeChallengeId) {
      setChallengeLegIndex(0);
      setChallengeComplete(false);
    }
    if (activeLesson) setLessonRun(null);
    if (activeRingRunId) {
      setNewRingRunBest(false);
      ringRunCueKeyRef.current = "";
      ringRunGateRef.current = 0;
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
      setActivity((current) => setActivityPhase(current, "complete"));
      return;
    }
    setChallengeLegIndex((index) => index + 1);
  }, [activeChallenge, activeChallengeLeg, challengeComplete, challengeLegIndex, telemetry]);

  useEffect(() => {
    if (!activeLesson || telemetry.paused) return;
    setLessonRun((current) => {
      if (!current || current.lessonId !== activeLesson.id) return beginLessonRun(activeLesson, telemetry);
      return evaluateLessonRun(activeLesson, current, telemetry);
    });
  }, [activeLesson, telemetry]);

  useEffect(() => {
    if (!activeLesson || !lessonRun) return;
    const cueKey = `${activeLesson.id}:${lessonRun.stepIndex}:${lessonRun.completed}:${lessonRun.failed}:${lessonRun.checkpointRestartRequested}`;
    if (lessonCueKeyRef.current === cueKey) return;
    const previousKey = lessonCueKeyRef.current;
    lessonCueKeyRef.current = cueKey;
    if (lessonRun.completed) {
      engineRef.current?.playActivityCue("complete");
      setActivity((current) => setActivityPhase(current, "complete"));
      setSchoolProgress((current) => {
        const next = completeFlightLesson(current, activeLesson.id);
        saveFlightSchoolProgress(next);
        return next;
      });
    } else if (lessonRun.failed || lessonRun.checkpointRestartRequested) {
      engineRef.current?.playActivityCue("failure");
      if (lessonRun.failed) setActivity((current) => setActivityPhase(current, "failed"));
    } else if (previousKey.startsWith(`${activeLesson.id}:`)) {
      engineRef.current?.playActivityCue("success");
    }
  }, [activeLesson, lessonRun]);

  useEffect(() => {
    if (!activeLesson || !lessonRun) return;
    const passedGateIds = new Set(
      activeLesson.steps
        .slice(0, lessonRun.stepIndex)
        .flatMap((step) => step.gateId ? [step.gateId] : []),
    );
    engineRef.current?.updateTrainingGates(activeLessonStep?.gateId ?? null, passedGateIds);
  }, [activeLesson, activeLessonStep, lessonRun]);

  useEffect(() => {
    if (!activeLesson?.landingCheckpointSpawn || !lessonRun?.checkpointRestartRequested || checkpointRestartRef.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    checkpointRestartRef.current = true;
    void engine.spawnAt(activeLesson.landingCheckpointSpawn).then(() => {
      engine.enterFlightMode(true);
      setMobileControlResetKey((value) => value + 1);
      setLessonRun((current) => current
        ? restartLessonAtCheckpoint(activeLesson, current, {
            ...telemetry,
            headingDegrees: activeLesson.landingCheckpointSpawn!.headingDegrees,
            altitudeAglMeters: activeLesson.landingCheckpointSpawn!.airborneAltitudeMeters ?? telemetry.altitudeAglMeters,
            simulationTimeSeconds: 0,
            crashed: false,
            grounded: false,
            landingStatus: "",
          })
        : current);
    }).finally(() => {
      checkpointRestartRef.current = false;
    });
  }, [activeLesson, lessonRun, telemetry]);

  useEffect(() => {
    if (!activeRingCourse || !activeRingSnapshot) return;
    if (activeRingSnapshot.activeGateIndex > ringRunGateRef.current && activeRingSnapshot.phase === "racing") {
      ringRunGateRef.current = activeRingSnapshot.activeGateIndex;
      engineRef.current?.playActivityCue("success");
    }
    const cueKey = `${activeRingCourse.id}:${activeRingSnapshot.phase}:${activeRingSnapshot.elapsedSeconds.toFixed(3)}`;
    if (activeRingSnapshot.phase === "complete" && ringRunCueKeyRef.current !== cueKey) {
      ringRunCueKeyRef.current = cueKey;
      const previousBest = ringRunProgress.bestTimesSeconds[activeRingCourse.id];
      const isNewBest = previousBest === undefined || activeRingSnapshot.elapsedSeconds < previousBest;
      setNewRingRunBest(isNewBest);
      setRingRunProgress((current) => {
        const next = recordRingRunTime(current, activeRingCourse.id, activeRingSnapshot.elapsedSeconds);
        saveRingRunProgress(next);
        return next;
      });
      setActivity((current) => setActivityPhase(current, "complete"));
      engineRef.current?.playActivityCue("complete");
    } else if (activeRingSnapshot.phase === "failed" && ringRunCueKeyRef.current !== cueKey) {
      ringRunCueKeyRef.current = cueKey;
      setActivity((current) => setActivityPhase(current, "failed"));
      engineRef.current?.playActivityCue("failure");
    }
  }, [activeRingCourse, activeRingSnapshot, ringRunProgress.bestTimesSeconds]);

  const clearActiveChallenge = () => {
    engineRef.current?.clearTrainingGates();
    engineRef.current?.stopRingRun();
    setActivity(exitActivity());
    setChallengeLegIndex(0);
    setChallengeComplete(false);
    setLessonRun(null);
    setNewRingRunBest(false);
  };

  const startChallenge = async (challenge: FlightChallenge) => {
    engineRef.current?.clearTrainingGates();
    engineRef.current?.stopRingRun();
    setLessonRun(null);
    setSelectedChallengeId(challenge.id);
    engineRef.current?.setDaylightHour(challenge.localHour);
    engineRef.current?.setWeatherPreset("clear");
    const started = await startFlight(
      challengeSpawnRequest(challenge),
      `${challenge.title} · ${challenge.originLabel}`,
      challenge.originCode,
      "clear",
    );
    if (!started) return;
    setActivity(startActivity("challenge", challenge.id));
    setChallengeLegIndex(0);
    setChallengeComplete(false);
  };

  const startLesson = async (lesson: FlightLesson) => {
    engineRef.current?.stopRingRun();
    setSelectedLessonId(lesson.id);
    setChallengeLegIndex(0);
    setChallengeComplete(false);
    setLessonRun(null);
    setLessonTrackerExpanded(false);
    lessonCueKeyRef.current = "";
    engineRef.current?.setDaylightHour(lesson.localHour);
    engineRef.current?.setWeatherPreset("clear");
    const started = await startFlight(lesson.spawn, `${lesson.title} · Flight School`, undefined, "clear");
    if (!started) return;
    setActivity(startActivity("lesson", lesson.id));
    engineRef.current?.showTrainingGates(lesson.gates, lesson.spawn.elevationMeters);
    engineRef.current?.playActivityCue("start");
  };

  const exitLesson = () => {
    engineRef.current?.clearTrainingGates();
    engineRef.current?.enterExploreMode();
    setActivity(exitActivity());
    setLessonRun(null);
    setLessonTrackerExpanded(false);
    setSetupView("flight-school");
    setShowBriefing(true);
    setShowSettings(false);
  };

  const restartActiveLesson = () => {
    if (activeLesson) void startLesson(activeLesson);
  };

  const restartActiveLessonStep = () => {
    if (!activeLesson || !lessonRun) return;
    if (telemetry.crashed) {
      restartActiveLesson();
      return;
    }
    setLessonRun(restartLessonStep(lessonRun, telemetry));
  };

  const startRingRun = async (course: RingCourse) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.clearTrainingGates();
    engine.stopRingRun();
    setSelectedCourseId(course.id);
    setChallengeLegIndex(0);
    setChallengeComplete(false);
    setLessonRun(null);
    setNewRingRunBest(false);
    ringRunCueKeyRef.current = "";
    ringRunGateRef.current = 0;
    engine.setDaylightHour(course.localHour);
    engine.setWeatherPreset("clear");
    const started = await startFlight(course.spawn, `${course.title} · Ring Run`, undefined, "clear");
    if (!started) return;
    engine.setPaused(true);
    setActivity(startActivity("ring-run", course.id));
    await engine.startRingRun(course);
    engine.playActivityCue("start");
  };

  const exitRingRun = () => {
    engineRef.current?.stopRingRun();
    engineRef.current?.enterExploreMode();
    setActivity(exitActivity());
    setNewRingRunBest(false);
    setSetupView("ring-runs");
    setShowBriefing(true);
    setShowSettings(false);
  };

  const restartActiveRingRun = () => {
    if (!activeRingCourse) return;
    engineRef.current?.respawn();
    setMobileControlResetKey((value) => value + 1);
    setActivity(startActivity("ring-run", activeRingCourse.id));
    setNewRingRunBest(false);
    ringRunCueKeyRef.current = "";
    ringRunGateRef.current = 0;
    engineRef.current?.playActivityCue("start");
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
    setSelectedPlace({
      kind: "airport",
      airport,
      label: airport.name,
      secondary: `${airport.municipality || airport.country} · ${airport.iata || airport.ident} · RWY ${airport.runway}`,
    });
    setShareStatus("");
    engineRef.current?.showAirportMarkers([airport]);
    window.requestAnimationFrame(() => {
      if (setupScrollRef.current) setupScrollRef.current.scrollTop = 0;
    });
  };

  const selectCity = (city: GeocodingResult) => {
    clearActiveChallenge();
    const [label, ...locationParts] = city.label.split(",");
    setSelectedPlace({
      kind: "city",
      city,
      label: label.trim(),
      secondary: locationParts.join(",").trim() || `${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}`,
    });
    setSpawnMode("air");
    setShareStatus("");
    engineRef.current?.clearAirportMarkers();
    window.requestAnimationFrame(() => {
      if (setupScrollRef.current) setupScrollRef.current.scrollTop = 0;
    });
  };

  const selectPopularDestination = (destination: (typeof POPULAR_DESTINATIONS)[number]) => {
    setQuery(destination.label);
    selectCity({
      id: destination.id,
      label: `${destination.label}, ${destination.country}`,
      latitude: destination.latitude,
      longitude: destination.longitude,
    });
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

  const selectedSpawn = (): { spawn: SpawnRequest; airportCode?: string } | null => {
    if (!selectedPlace) return null;
    if (selectedPlace.kind === "airport") {
      return {
        spawn: spawnFromAirport(selectedPlace.airport, spawnMode),
        airportCode: selectedPlace.airport.ident,
      };
    }
    return {
      spawn: {
        latitudeDegrees: selectedPlace.city.latitude,
        longitudeDegrees: selectedPlace.city.longitude,
        elevationMeters: 0,
        headingDegrees: 0,
        mode: "air",
        airborneAltitudeMeters: FLIGHT_TUNING.defaultAirborneSpawnAltitudeMeters,
      },
    };
  };

  const takeOffFromSelectedPlace = async () => {
    const selection = selectedSpawn();
    if (!selection || !selectedPlace) return;
    clearActiveChallenge();
    engineRef.current?.setDaylightHour(setupHour);
    await startFlight(selection.spawn, selectedPlace.label, selection.airportCode, setupWeather);
  };

  const copySelectedPlaceLink = async () => {
    const selection = selectedSpawn();
    if (!selection) return;
    updateSpawnUrl(selection.spawn, selection.airportCode, setupWeather);
    await copyShareLink();
  };

  const clearSelectedPlace = () => {
    setSelectedPlace(null);
    setShareStatus("");
    engineRef.current?.clearAirportMarkers();
  };

  const speedKnots = Math.round(metersPerSecondToKnots(telemetry.airspeedMetersPerSecond));
  const altitudeAglFeet = formatNonNegativeFeet(telemetry.altitudeAglMeters);
  const altitudeMslFeet = formatNonNegativeFeet(telemetry.altitudeMslMeters);
  const verticalSpeed = Math.round(metersPerSecondToFeetPerMinute(telemetry.verticalSpeedMetersPerSecond));
  const flightStateLabel = telemetry.crashed ? "Crashed" : telemetry.grounded ? "Ground" : "Airborne";
  const headingLabel = formatCompassHeading(telemetry.headingDegrees);
  const pitchLabel = `${telemetry.pitchDegrees >= 0 ? "+" : ""}${Math.round(telemetry.pitchDegrees)}`;
  const bankLabel = `${telemetry.bankDegrees >= 0 ? "+" : ""}${Math.round(telemetry.bankDegrees)}`;

  const continueAfterLesson = () => {
    if (!activeLesson) return;
    const nextLesson = FLIGHT_LESSONS[activeLesson.number];
    if (nextLesson) void startLesson(nextLesson);
    else exitLesson();
  };

  const lessonTrackerOpen = lessonTrackerExpanded || Boolean(lessonRun?.completed || lessonRun?.failed);

  return (
    <main className={`app-shell${showBriefing ? " is-menu-open" : ""}${flightTransition.phase !== "idle" ? " is-transitioning" : ""}${activeLesson && lessonRun ? " has-active-lesson" : ""}${activeRingSnapshot ? " has-active-ring-run" : ""}`} onPointerDownCapture={unlockSound} onKeyDownCapture={unlockSound}>
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

          <CompassTape headingDegrees={telemetry.headingDegrees} />

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
              <div className="hud-metric"><span>Pitch</span><strong>{pitchLabel}</strong><small>DEG</small></div>
              <div className="hud-metric"><span>Bank</span><strong>{bankLabel}</strong><small>DEG</small></div>
              <div className="hud-metric hud-metric--flaps"><span>Flaps</span><strong>{Math.round(telemetry.flaps * 100)}</strong><small>%</small></div>
            </div>

            <div className="hud-column hud-column--right">
              <div className="hud-metric hud-metric--heading"><span>Heading</span><strong>{headingLabel}</strong><small>DEG</small></div>
              <div className="hud-metric hud-metric--throttle">
                <span>Throttle</span><strong>{Math.round(telemetry.throttle * 100)}</strong><small>%</small>
                <span className="hud-throttle" aria-hidden="true"><span style={{ height: `${Math.round(telemetry.throttle * 100)}%` }} /></span>
              </div>
              <div className="hud-metric"><span>Brakes</span><strong>{telemetry.brakes > 0 ? "ON" : "OFF"}</strong></div>
              <div className="hud-metric"><span>State</span><strong>{flightStateLabel.toUpperCase()}</strong></div>
              <div className="hud-metric"><span>Camera</span><strong>{cameraModeLabel(telemetry.cameraMode).toUpperCase()}</strong></div>
              <div className="hud-metric"><span>Render</span><strong>{Math.round(telemetry.fps)}</strong><small>FPS</small></div>
              <div className="hud-metric"><span>Quality</span><strong>{telemetry.quality.toUpperCase()}</strong></div>
            </div>
          </section>

          <AttitudeIndicator pitchDegrees={telemetry.pitchDegrees} bankDegrees={telemetry.bankDegrees} />

          {coarsePointer && !portraitOrientation && (
            <MobileFlightControls
              speedKnots={speedKnots}
              altitudeFeet={altitudeMslFeet}
              headingDegrees={telemetry.headingDegrees}
              throttle={telemetry.throttle}
              flaps={telemetry.flaps}
              paused={telemetry.paused}
              crashed={telemetry.crashed}
              resetKey={mobileControlResetKey}
              onAxesChange={setTouchAxes}
              onYawChange={setTouchYaw}
              onThrottleChange={setTouchThrottle}
              onBrakeChange={setTouchBrake}
              onCycleFlaps={cycleTouchFlaps}
              onReleaseMomentary={releaseTouchControls}
            />
          )}

          <div className="hud-utility">
            <Sun size={14} aria-hidden="true" />
            <span>Daylight</span>
            <strong>{daylightPresetForHour(telemetry.daylight.localHour).label}</strong>
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

          {activeLesson && lessonRun && (
            <aside className={`lesson-tracker${lessonTrackerOpen ? " is-expanded" : ""}${lessonRun.completed ? " is-complete" : ""}${lessonRun.failed ? " is-failed" : ""}`} aria-label="Active Flight School lesson">
              <div className="lesson-tracker__compact">
                <div className="lesson-tracker__index" aria-label={`Step ${lessonRun.stepIndex + 1} of ${activeLesson.steps.length}`}>
                  <span>{(lessonRun.stepIndex + 1).toString().padStart(2, "0")}</span>
                  <small>/{activeLesson.steps.length.toString().padStart(2, "0")}</small>
                </div>
                <div className="lesson-tracker__compact-copy">
                  <span><GraduationCap size={12} aria-hidden="true" /> Lesson {activeLesson.number.toString().padStart(2, "0")} · {activeLesson.title}</span>
                  <strong>{lessonRun.completed ? "Lesson complete" : lessonRun.failed ? "Lesson interrupted" : activeLessonStep?.title}</strong>
                  {!lessonRun.completed && !lessonRun.failed && activeLessonStep && <p>{coarsePointer ? mobileInstructionText(activeLessonStep.instruction) : activeLessonStep.instruction}</p>}
                </div>
                {!lessonRun.completed && !lessonRun.failed && activeLessonStep && <kbd>{coarsePointer ? mobileControlLabel(activeLessonStep.control) : activeLessonStep.control}</kbd>}
                <button
                  type="button"
                  className="lesson-tracker__expand"
                  onClick={() => setLessonTrackerExpanded((value) => !value)}
                  aria-label={lessonTrackerOpen ? "Hide lesson details" : "Show lesson details"}
                  aria-expanded={lessonTrackerOpen}
                  disabled={lessonRun.completed || lessonRun.failed}
                >
                  {lessonTrackerOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                </button>
                <button type="button" className="lesson-tracker__exit" onClick={exitLesson} aria-label="Exit lesson"><X size={16} aria-hidden="true" /></button>
              </div>
              <div className="lesson-tracker__progress" aria-hidden="true">
                <span style={{ width: `${lessonStepProgress(activeLesson, lessonRun) * 100}%` }} />
              </div>

              {lessonTrackerOpen && (
                <div className="lesson-tracker__details">
                  {lessonRun.completed ? (
                    <div className="lesson-tracker__result">
                      <CircleCheck size={30} aria-hidden="true" />
                      <div><strong>Lesson complete</strong><p>Your progress has been saved on this device.</p></div>
                      <button type="button" onClick={continueAfterLesson}>{activeLesson.number < FLIGHT_LESSONS.length ? "Continue to next lesson" : "Return to Flight School"}</button>
                      <button type="button" className="lesson-tracker__secondary" onClick={restartActiveLesson}>Replay lesson</button>
                    </div>
                  ) : lessonRun.failed ? (
                    <div className="lesson-tracker__result lesson-tracker__result--failed">
                      <RotateCcw size={28} aria-hidden="true" />
                      <div><strong>Lesson interrupted</strong><p>{lessonRun.feedback}</p></div>
                      <button type="button" onClick={restartActiveLesson}>Restart lesson</button>
                      <button type="button" className="lesson-tracker__secondary" onClick={exitLesson}>Exit</button>
                    </div>
                  ) : activeLessonStep && (
                    <>
                      <div className="lesson-tracker__instruction">
                        <span><Target size={13} aria-hidden="true" /> Current instruction</span>
                        <strong>{activeLessonStep.title}</strong>
                        <p>{coarsePointer ? mobileInstructionText(activeLessonStep.instruction) : activeLessonStep.instruction}</p>
                      </div>
                      <div className="lesson-tracker__target">
                        <div><span>Control</span><kbd>{coarsePointer ? mobileControlLabel(activeLessonStep.control) : activeLessonStep.control}</kbd></div>
                        <div><span>Target</span><strong>{activeLessonStep.target}</strong></div>
                        <div><span>Live</span><strong>{lessonLiveReadout(activeLessonStep.id, telemetry)}</strong></div>
                        {activeGateDistance !== null && <div><span>Gate distance</span><strong>{activeGateDistance < 1_000 ? `${Math.round(activeGateDistance)} m` : `${(activeGateDistance / 1_000).toFixed(1)} km`}</strong></div>}
                      </div>
                      <p className="lesson-tracker__feedback" aria-live="polite">{lessonRun.feedback}</p>
                      <footer>
                        <button type="button" onClick={restartActiveLessonStep}>Restart step</button>
                        <button type="button" onClick={restartActiveLesson}>Restart lesson</button>
                        <button type="button" onClick={exitLesson}>Exit</button>
                      </footer>
                    </>
                  )}
                </div>
              )}
            </aside>
          )}

          {activeRingCourse && activeRingSnapshot && (
            <RingRunTracker
              course={activeRingCourse}
              snapshot={activeRingSnapshot}
              bestTimeSeconds={ringRunProgress.bestTimesSeconds[activeRingCourse.id]}
              newPersonalBest={newRingRunBest}
              onRestart={restartActiveRingRun}
              onExit={exitRingRun}
            />
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
            <aside className="settings-popover" aria-label="Daylight controls">
              <header>
                <div><Sun size={14} aria-hidden="true" /><span>Daylight</span></div>
                <button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={16} aria-hidden="true" /></button>
              </header>
              <div className="daylight-heading">
                <span>Current lighting</span>
                <strong>{daylightPresetForHour(telemetry.daylight.localHour).label}</strong>
                <small>Fixed while flying</small>
              </div>
              <div className="daylight-presets">
                {DAYLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={daylightPresetForHour(telemetry.daylight.localHour).id === preset.id}
                    onClick={() => setDaylightHour(preset.localHour)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="settings-progress-reset">
                <span>Local activity progress</span>
                <button type="button" onClick={() => setSchoolProgress(resetFlightSchoolProgress())}>Reset lesson progress</button>
                <button type="button" onClick={() => setRingRunProgress(resetRingRunProgress())}>Reset Ring Run times</button>
              </div>
            </aside>
          )}
        </>
      )}

      {!showBriefing && telemetry.crashed && !activeRingCourse && (
        <section className="crash-panel" role="alert">
          <h2>{telemetry.crashReason === "building" ? "Building collision" : "Terrain impact"}</h2>
          <p>The aircraft has been stopped at the impact surface. {coarsePointer ? "Select Respawn to restart from your selected location." : "Press R or use Respawn to restart from your selected location."}</p>
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
              <img className="setup-brand__mark" src="https://worldflightsim.com/assets/brand/wfs-mark-white.png" alt="WFS" />
              <div><h1>World Flight Sim</h1><span>{telemetry.worldLabel}</span></div>
            </div>
            <div className="setup-primary-nav">
              <button type="button" className={setupView === "explore" ? "is-active" : ""} onClick={() => setSetupView("explore")}>Explore</button>
              <button type="button" className={setupView === "flight-school" ? "is-active" : ""} onClick={() => setSetupView("flight-school")}>Flight school</button>
              <button type="button" className={setupView === "challenges" ? "is-active" : ""} onClick={() => setSetupView("challenges")}>Challenges</button>
              <button type="button" className={setupView === "ring-runs" ? "is-active" : ""} onClick={() => setSetupView("ring-runs")}>Ring runs</button>
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
          <div ref={setupScrollRef} className={`setup-scroll${selectedPlace ? " setup-scroll--place-selected" : ""}`}>
            <section className="setup-intro">
              <span>Explore</span>
              <h2 aria-label="Choose the world">Fly <em>anywhere</em> on Earth</h2>
              <p>Type any airport, city, or landmark in the world, then choose your start and take off from there.</p>
              <button type="button" onClick={() => setShowControls(true)}><SlidersHorizontal size={15} aria-hidden="true" /> Controls</button>
            </section>

            <div className={`setup-grid${selectedPlace ? " setup-grid--selected" : ""}`}>
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
                <div className="location-search-stack">
                  <form className="location-search" onSubmit={(event) => void submitSearch(event)}>
                    <Search size={18} aria-hidden="true" />
                    <label className="sr-only" htmlFor="world-query">{searchKind === "airport" ? "Airport name, ICAO, or IATA" : "City name"}</label>
                    <input
                      id="world-query"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        if (selectedPlace) clearSelectedPlace();
                      }}
                      autoComplete="off"
                      aria-expanded={!selectedPlace && Boolean(searchError || airportResults.length || cityResults.length)}
                      placeholder={searchKind === "airport" ? "Search airport, ICAO, or IATA…" : "Search any city…"}
                    />
                    <button type="submit" aria-label="Search" disabled={searching}>{searching ? "…" : "Search"}</button>
                  </form>

                  {!selectedPlace && (
                    <section className="search-dropdown" aria-label="Location search results">
                      <header>
                        <span>Search results</span>
                        <small>{airportResults.length || cityResults.length} shown</small>
                      </header>
                      <div className="search-tabs" role="tablist" aria-label="Location search type">
                        <button type="button" role="tab" aria-selected={searchKind === "airport"} onClick={() => chooseSearchKind("airport")}><Gauge size={13} aria-hidden="true" /> Airports</button>
                        <button type="button" role="tab" aria-selected={searchKind === "city"} onClick={() => chooseSearchKind("city")}><MapPinned size={13} aria-hidden="true" /> Cities</button>
                      </div>
                      {searchError && <p className="search-error" role="alert">{searchError}</p>}
                      <div className="search-results">
                        {searchKind === "airport" && airportResults.map((airport, index) => (
                          <button type="button" key={airport.ident} onClick={() => selectAirport(airport)} disabled={searching}>
                            <span className="result-rank">{index + 1}</span>
                            <strong>{airport.iata || airport.ident}</strong>
                            <span>{airport.name}</span>
                            <small>{airport.municipality || airport.country} · RWY {airport.runway} · {Math.round(airport.lengthFeet).toLocaleString()} ft</small>
                          </button>
                        ))}
                        {searchKind === "city" && cityResults.map((city) => (
                          <button type="button" className="search-result--city" key={city.id} onClick={() => selectCity(city)} disabled={searching}>
                            <MapPinned className="search-result__pin" size={19} aria-hidden="true" />
                            <strong>{city.label.split(",")[0]}</strong>
                            <span>{city.label.split(",").slice(1).join(",").trim() || city.label}</span>
                            <small>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)} · airborne</small>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {selectedPlace && (
                  <section className="selected-flight-setup" aria-label={`Flight setup for ${selectedPlace.label}`}>
                    <header className="selected-flight-setup__header">
                      <div>
                        <span>Flight setup</span>
                        <strong>{selectedPlace.label}</strong>
                        <small>{selectedPlace.secondary}</small>
                      </div>
                      <div>
                        <span>{daylightPresetForHour(setupHour).label} · {weatherPresetLabel(setupWeather)} · {spawnMode === "runway" ? "Runway start" : "Air start"}</span>
                        <button type="button" onClick={clearSelectedPlace} aria-label="Clear selected place"><X size={20} aria-hidden="true" /></button>
                      </div>
                    </header>

                    <div className="selected-flight-setup__controls">
                      <section>
                        <span className="field-label">Start mode</span>
                        <div className="spawn-mode spawn-mode--expanded" aria-label="Airport spawn mode">
                          <button type="button" aria-pressed={spawnMode === "air"} onClick={() => setSpawnMode("air")}><strong>AIR</strong><span>Airborne</span></button>
                          <button type="button" aria-pressed={spawnMode === "runway"} onClick={() => setSpawnMode("runway")} disabled={selectedPlace.kind === "city"}><strong>RWY</strong><span>Runway</span></button>
                        </div>
                      </section>

                      <section className="setup-option-card">
                        <label htmlFor="setup-time">Daylight</label>
                        <select id="setup-time" value={setupHour} onChange={(event) => {
                          const hour = Number(event.target.value);
                          setSetupHour(hour);
                          engineRef.current?.setDaylightHour(hour);
                        }}>
                          {DAYLIGHT_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.localHour}>{preset.label}</option>
                          ))}
                        </select>
                      </section>

                      <section className="setup-option-card setup-option-card--weather">
                        <span>Weather</span>
                        <div role="group" aria-label="Weather preset">
                          {WEATHER_PRESETS.map((preset) => (
                            <button
                              type="button"
                              key={preset.id}
                              aria-pressed={setupWeather === preset.id}
                              onClick={() => setSetupWeather(preset.id)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>

                    <footer className="selected-flight-setup__actions">
                      <button type="button" className="selected-takeoff-button" onClick={() => void takeOffFromSelectedPlace()} disabled={searching}><Plane size={20} aria-hidden="true" /> Take off</button>
                      <button type="button" onClick={() => void copySelectedPlaceLink()}><Link2 size={18} aria-hidden="true" /> Share this spot</button>
                    </footer>
                    <p className="selected-flight-setup__status" aria-live="polite">{shareStatus || "Choose your start, then take off from this exact spot."}</p>
                  </section>
                )}
              </section>

              <aside className="destinations-panel destinations-panel--popular" aria-label="Popular destinations">
                <header>
                  <div><span>Destinations</span></div>
                  <Compass size={20} aria-hidden="true" />
                </header>
                <div className="popular-destinations">
                  {POPULAR_DESTINATIONS.map((destination, index) => (
                    <button type="button" key={destination.id} onClick={() => selectPopularDestination(destination)}>
                      <span>{index + 1}</span>
                      <strong>{destination.label}</strong>
                      <small>{destination.visits} visits</small>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </div>
          ) : setupView === "flight-school" ? (
            <div className="setup-scroll setup-scroll--flight-school">
              <FlightSchoolPanel
                selectedLesson={selectedLesson}
                progress={schoolProgress}
                busy={searching}
                touchControls={coarsePointer}
                onSelect={(lesson) => setSelectedLessonId(lesson.id)}
                onStart={(lesson) => void startLesson(lesson)}
              />
            </div>
          ) : setupView === "challenges" ? (
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
          ) : (
            <div className="setup-scroll setup-scroll--ring-runs">
              <RingRunsPanel
                selectedCourse={selectedCourse}
                progress={ringRunProgress}
                busy={searching}
                onSelect={(course) => setSelectedCourseId(course.id)}
                onStart={(course) => void startRingRun(course)}
              />
            </div>
          )}

          <nav className="setup-mobile-nav" aria-label="Mobile setup navigation">
            <button type="button" aria-current={setupView === "explore" ? "page" : undefined} onClick={() => setSetupView("explore")}><Compass aria-hidden="true" /><span>Explore</span></button>
            <button type="button" aria-current={setupView === "flight-school" ? "page" : undefined} onClick={() => setSetupView("flight-school")}><GraduationCap aria-hidden="true" /><span>School</span></button>
            <button type="button" aria-current={setupView === "challenges" ? "page" : undefined} onClick={() => setSetupView("challenges")}><Flag aria-hidden="true" /><span>Challenges</span></button>
            <button type="button" aria-current={setupView === "ring-runs" ? "page" : undefined} onClick={() => setSetupView("ring-runs")}><Route aria-hidden="true" /><span>Rings</span></button>
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

      {!showBriefing && telemetry.paused && status.phase === "ready" && !mobilePortraitBlocked && (
        <section className="pause-panel" aria-label="Flight paused"><strong>Paused</strong><span>{coarsePointer ? "Select Resume to continue." : "Press Esc or select Resume."}</span></section>
      )}

      {mobilePortraitBlocked && (
        <section className="mobile-orientation-lock" role="alert" aria-label="Landscape orientation required">
          <div className="mobile-orientation-lock__device" aria-hidden="true">
            <Smartphone size={42} />
            <RotateCw size={24} />
          </div>
          <strong>Rotate your phone</strong>
          <p>Flight controls are available in landscape. The aircraft is paused and will remain paused after rotation.</p>
        </section>
      )}

      {showControls && <ControlsPanel touchControls={coarsePointer} onClose={() => setShowControls(false)} />}

      <div className="provider-credit">Cessna 172SP · {photorealisticEvaluation ? "photorealistic scenery" : "OSM scenery"}</div>
    </main>
  );
}

export default App;
