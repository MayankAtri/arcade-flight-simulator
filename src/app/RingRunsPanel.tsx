import {
  Clock3,
  Gauge,
  MapPinned,
  Medal,
  Plane,
  Play,
  Route,
  Trophy,
} from "lucide-react";
import { RING_COURSES } from "../ring-runs/courses";
import { formatRunTime, medalForTime, type RingRunProgress } from "../ring-runs/progress";
import type { RingCourse } from "../ring-runs/types";

type RingRunsPanelProps = {
  selectedCourse: RingCourse;
  progress: RingRunProgress;
  busy: boolean;
  onSelect: (course: RingCourse) => void;
  onStart: (course: RingCourse) => void;
};

const RoutePreview = ({ course }: { course: RingCourse }) => {
  const latitudes = course.gates.map((gate) => gate.latitudeDegrees);
  const longitudes = course.gates.map((gate) => gate.longitudeDegrees);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.001);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.001);
  const points = course.gates.map((gate) => ({
    x: 10 + ((gate.longitudeDegrees - minLongitude) / longitudeSpan) * 80,
    y: 88 - ((gate.latitudeDegrees - minLatitude) / latitudeSpan) * 76,
  }));

  return (
    <svg className="ring-route-preview" viewBox="0 0 100 100" role="img" aria-label={`${course.title} route with ${course.gates.length} rings`}>
      <defs>
        <linearGradient id={`route-${course.id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#d4f6ff" />
          <stop offset="1" stopColor="#52c7ed" />
        </linearGradient>
      </defs>
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={`url(#route-${course.id})`} strokeWidth="1.2" />
      {points.map((point, index) => (
        <g key={course.gates[index].id}>
          <circle cx={point.x} cy={point.y} r={index === 0 || index === points.length - 1 ? 2.4 : 1.5} />
          {(index === 0 || index === points.length - 1) && <text x={point.x + 3} y={point.y - 2}>{index === 0 ? "START" : "FINISH"}</text>}
        </g>
      ))}
    </svg>
  );
};

export function RingRunsPanel({
  selectedCourse,
  progress,
  busy,
  onSelect,
  onStart,
}: RingRunsPanelProps) {
  const bestEntries = Object.entries(progress.bestTimesSeconds);
  const goldCount = bestEntries.filter(([courseId, seconds]) => {
    const course = RING_COURSES.find((candidate) => candidate.id === courseId);
    return course ? medalForTime(course, seconds) === "gold" : false;
  }).length;
  const overallBest = bestEntries.length ? Math.min(...bestEntries.map(([, seconds]) => seconds)) : null;
  const selectedBest = progress.bestTimesSeconds[selectedCourse.id];

  return (
    <div className="ring-runs-page">
      <header className="ring-runs-hero">
        <div>
          <span><Route size={15} aria-hidden="true" /> Precision courses</span>
          <h2>Race the rings.<br />Master the line.</h2>
          <p>Thread glowing gates through real-world scenery, protect your energy, and improve your fastest clean run.</p>
        </div>
        <dl className="ring-runs-stats">
          <div><dt>PBs set</dt><dd>{bestEntries.length}</dd></div>
          <div><dt>Golds</dt><dd>{goldCount}</dd></div>
          <div><dt>Best time</dt><dd>{overallBest === null ? "—" : formatRunTime(overallBest)}</dd></div>
        </dl>
      </header>

      <div className="ring-runs-layout">
        <aside className="ring-aircraft-card" aria-label="Ring Run aircraft">
          <div className="ring-aircraft-card__stage"><img src="/assets/aircraft/cessna-172sp-preview.png" alt="Cessna 172SP" /></div>
          <div className="ring-aircraft-card__copy">
            <span>Active aircraft</span>
            <h3>Cessna 172SP</h3>
            <p>High-wing trainer</p>
            <dl>
              <div><dt>Cruise</dt><dd>122 kt</dd></div>
              <div><dt>Stall</dt><dd>48 kt</dd></div>
            </dl>
          </div>
        </aside>

        <main className="ring-course-feature" aria-label={`${selectedCourse.title} briefing`}>
          <div className="ring-course-feature__map">
            <RoutePreview course={selectedCourse} />
            <span>{selectedCourse.location}</span>
            <small>{selectedCourse.difficulty}</small>
          </div>
          <div className="ring-course-feature__body">
            <span>Selected course</span>
            <h3>{selectedCourse.title}</h3>
            <p>{selectedCourse.summary}</p>
            <dl className="ring-course-facts">
              <div><dt><MapPinned size={13} aria-hidden="true" /> Location</dt><dd>{selectedCourse.location}</dd></div>
              <div><dt><Route size={13} aria-hidden="true" /> Course</dt><dd>{selectedCourse.gates.length} rings · {selectedCourse.distanceKilometers.toFixed(1)} km</dd></div>
              <div><dt><Gauge size={13} aria-hidden="true" /> Difficulty</dt><dd>{selectedCourse.difficulty}</dd></div>
              <div><dt><Clock3 size={13} aria-hidden="true" /> Personal best</dt><dd>{selectedBest === undefined ? "Not set" : formatRunTime(selectedBest)}</dd></div>
            </dl>
            <div className="ring-medal-targets" aria-label="Medal targets">
              <span><Medal size={13} aria-hidden="true" /> Medal targets</span>
              <div><small>Gold</small><strong>{formatRunTime(selectedCourse.medalTimesSeconds.gold)}</strong></div>
              <div><small>Silver</small><strong>{formatRunTime(selectedCourse.medalTimesSeconds.silver)}</strong></div>
              <div><small>Bronze</small><strong>{formatRunTime(selectedCourse.medalTimesSeconds.bronze)}</strong></div>
            </div>
            <button type="button" className="ring-course-start" disabled={busy} onClick={() => onStart(selectedCourse)}>
              <Play size={17} aria-hidden="true" />
              Start run
            </button>
          </div>
        </main>

        <aside className="ring-course-library" aria-label="Ring Run courses">
          <header><span>Course library</span><small>{RING_COURSES.length} routes</small></header>
          {RING_COURSES.map((course, index) => {
            const selected = course.id === selectedCourse.id;
            const best = progress.bestTimesSeconds[course.id];
            const medal = best === undefined ? null : medalForTime(course, best);
            return (
              <button type="button" key={course.id} aria-pressed={selected} onClick={() => onSelect(course)}>
                <span>{(index + 1).toString().padStart(2, "0")}</span>
                <div><strong>{course.title}</strong><small>{course.location}</small></div>
                <div>{medal ? <Medal size={14} aria-label={`${medal} medal`} /> : <Plane size={14} aria-hidden="true" />}<small>{best === undefined ? `${course.gates.length} rings` : formatRunTime(best)}</small></div>
              </button>
            );
          })}
          <footer><Trophy size={15} aria-hidden="true" /><span>Personal bests are stored only on this device.</span></footer>
        </aside>
      </div>
    </div>
  );
}
