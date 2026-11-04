import { seededRandom } from "@/components/games/game-data";
import { cn } from "@/lib/utils";

// Meteor's own scene palette: deep space blues with the site's teal on the
// planet's edge and shield. The scene is always dark, in both site themes,
// and wraps its contents in `.dark` so UI components inside use dark tokens.
export const SPACE = {
  top: "#040915",
  mid: "#091330",
  low: "#0d1c3f",
  plate: "#0f1b3a",
  plateLine: "#2a3c6e",
  fire: "#ff9a5c",
  fireCore: "#ffd9b0",
  teal: "#3fc1a7",
  danger: "#f07167",
  text: "#f2f5fb",
} as const;

/** How much of the planet shows above the bottom of the scene, in px. */
export const PLANET_HEIGHT = 56;
/** The shield arc sits this far above the planet's edge. */
export const SHIELD_GAP = 22;
/** Half the height of the planet and shield ellipses, in px. */
const ARC_RADIUS_Y = 240;
/** Half the width of the shield ellipse, as a share of the scene width. */
const ARC_RADIUS_X = 0.95;

/**
 * How far below its top the shield arc is at `x` (0-1 across the scene),
 * in px, so a meteor off to the side lands on the curve, not above it.
 */
export function shieldDrop(x: number): number {
  const t = Math.min(0.99, Math.abs(x - 0.5) / ARC_RADIUS_X);
  return ARC_RADIUS_Y * (1 - Math.sqrt(1 - t * t));
}

type Star = { x: number; y: number; size: number; opacity: number };

function makeStars(count: number, seed: number): Star[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x: Math.round(random() * 1000) / 10,
    y: Math.round(random() * 1000) / 10,
    size: random() < 0.12 ? 2 : 1,
    opacity: Math.round((0.25 + random() * 0.6) * 100) / 100,
  }));
}

// Fixed positions, so the server and the browser draw the same sky.
const STARS = makeStars(70, 7);
const FEW_STARS = STARS.slice(0, 26);

/** The sky: gradient and stars. Fills its positioned parent. */
export function SpaceSky({ compact = false, className }: { compact?: boolean; className?: string }) {
  const stars = compact ? FEW_STARS : STARS;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, ${SPACE.mid} 0%, ${SPACE.top} 70%), ${SPACE.top}`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, transparent 40%, ${SPACE.low} 100%)`,
        }}
      />
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The planet's curved edge at the bottom of the scene, with the shield arc
 * above it. `shields` (0-3) sets how bright the shield glows; `alert` flashes
 * the edge after a meteor lands.
 */
export function Planet({
  shields = 3,
  alert = false,
  height = PLANET_HEIGHT,
  className,
}: {
  shields?: number;
  alert?: boolean;
  /** How much of the planet shows, in px. */
  height?: number;
  className?: string;
}) {
  const strength = Math.max(0, Math.min(3, shields)) / 3;
  const rim = alert ? SPACE.danger : SPACE.teal;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden", className)}
      style={{ height: height + SHIELD_GAP + 6 }}
    >
      {/* Shield */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] transition-[opacity,border-color] duration-500 ease-out"
        style={{
          width: `${ARC_RADIUS_X * 200}%`,
          height: ARC_RADIUS_Y * 2,
          top: 6,
          border: `1.5px solid ${rim}`,
          opacity: alert ? 0.9 : 0.15 + strength * 0.55,
          boxShadow: `0 -10px 40px -6px color-mix(in oklab, ${rim} ${Math.round(18 + strength * 30)}%, transparent)`,
        }}
      />
      {/* Planet */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] transition-[border-color,box-shadow] duration-300 ease-out"
        style={{
          width: "170%",
          height: ARC_RADIUS_Y * 2,
          top: SHIELD_GAP + 6,
          background: `radial-gradient(60% 8% at 50% 0%, #12424a 0%, #0a2430 45%, #061520 100%)`,
          borderTop: `2px solid ${rim}`,
          boxShadow: `0 -2px 18px -2px color-mix(in oklab, ${rim} 55%, transparent)`,
        }}
      />
    </div>
  );
}
