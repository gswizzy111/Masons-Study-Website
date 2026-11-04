"use client";

// One-off visual effects for Meteor, drawn straight into a layer element
// with the Web Animations API (transform and opacity only, so they stay on
// the compositor). Decorative: the layer is aria-hidden.
import { SPACE } from "@/components/games/meteor/backdrop";

const PARTICLE_COLORS = [SPACE.fire, SPACE.fireCore, "#ffffff", SPACE.teal];

function canAnimate(el: Element): boolean {
  return typeof (el as HTMLElement).animate === "function";
}

/** A short burst of sparks at (x, y). Skipped when motion is reduced. */
export function burst(layer: HTMLElement, x: number, y: number, reduced: boolean): void {
  if (reduced || !canAnimate(layer)) return;
  const group = document.createElement("div");
  group.style.cssText = `position:absolute;left:0;top:0;transform:translate3d(${x}px,${y}px,0);pointer-events:none;`;

  const ring = document.createElement("span");
  ring.style.cssText = `position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:9999px;border:2px solid ${SPACE.fireCore};`;
  group.appendChild(ring);

  const count = 12;
  const sparks: HTMLSpanElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    const size = 3 + (i % 3);
    spark.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;background:${PARTICLE_COLORS[i % PARTICLE_COLORS.length]};`;
    group.appendChild(spark);
    sparks.push(spark);
  }
  layer.appendChild(group);

  const animations: Animation[] = [];
  animations.push(
    ring.animate(
      [
        { transform: "scale(0.3)", opacity: 0.9 },
        { transform: "scale(1.9)", opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
    ),
  );
  sparks.forEach((spark, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.3;
    const distance = 34 + (i % 4) * 12;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    animations.push(
      spark.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: 460 + (i % 3) * 60, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
      ),
    );
  });
  Promise.all(animations.map((a) => a.finished))
    .catch(() => {})
    .finally(() => group.remove());
}

/** "+150" floating up from (x, y). With reduced motion it fades in place. */
export function scorePop(layer: HTMLElement, x: number, y: number, text: string, reduced: boolean): void {
  if (!canAnimate(layer)) return;
  const el = document.createElement("span");
  el.textContent = text;
  el.style.cssText = `position:absolute;left:0;top:0;transform:translate3d(${x}px,${y}px,0) translate(-50%,-50%);pointer-events:none;font-family:var(--font-mono);font-weight:600;font-size:15px;color:${SPACE.fireCore};text-shadow:0 1px 8px rgb(0 0 0 / 0.6);white-space:nowrap;`;
  layer.appendChild(el);
  const base = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
  const animation = el.animate(
    reduced
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
      : [
          { transform: `${base} translateY(0px)`, opacity: 0 },
          { transform: `${base} translateY(-10px)`, opacity: 1, offset: 0.2 },
          { transform: `${base} translateY(-34px)`, opacity: 0 },
        ],
    { duration: reduced ? 900 : 760, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
  );
  animation.finished.catch(() => {}).finally(() => el.remove());
}

/** A short shake of the scene when a meteor lands. Skipped when motion is reduced. */
export function shake(el: HTMLElement, reduced: boolean): void {
  if (reduced || !canAnimate(el)) return;
  el.animate(
    [
      { transform: "translate3d(0, 0, 0)" },
      { transform: "translate3d(-7px, 2px, 0)" },
      { transform: "translate3d(6px, -2px, 0)" },
      { transform: "translate3d(-4px, 1px, 0)" },
      { transform: "translate3d(2px, 0, 0)" },
      { transform: "translate3d(0, 0, 0)" },
    ],
    { duration: 360, easing: "ease-out" },
  );
}
