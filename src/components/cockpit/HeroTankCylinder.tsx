"use client";

/**
 * HeroTankCylinder — volumetric storage-tank glyph for the crude-movement hero.
 *
 * Draws an actual tank rather than a bar: elliptical roof, shaded shell that
 * reads as a cylinder, welded course rings, and a liquid body whose surface is
 * an ellipse (the meniscus) so the level reads as a volume seen in perspective.
 *
 * Shading is built from the semantic token layer only — the gradients are
 * white/black alpha ramps over --surface-overlay, so the glyph inverts
 * correctly between the dark and light themes without a second palette.
 *
 * Presentational: the level arrives as a prop. It does NOT read the store.
 * Companion to TankGauge (the flat card instrument used elsewhere in the app).
 */

import { useId } from "react";
import { cn } from "@/lib/cn";
import { TANK_HIGH_LEVEL_ALARM } from "@/lib/simulation/types";

// ============================================================================
// GEOMETRY (SVG viewBox units)
// ============================================================================

/**
 * Sized to fill the tank slot's height budget (HERO_TANK_SLOTS, ~80 viewBox
 * units) once the tag line above it is accounted for — the tank is the hero of
 * the glyph, so it takes the space rather than sitting in it as an icon.
 */
const W = 84;
const H = 88;
/** Roof/floor ellipse minor radius — the perspective squash of the circle. */
const RY = 10;
const RX = (W - 2) / 2;
const CX = W / 2;
/** Shell spans roof centre → floor centre; the caps bulge beyond it. */
const SHELL_TOP = RY + 1;
const SHELL_BOTTOM = H - RY - 1;
const SHELL_H = SHELL_BOTTOM - SHELL_TOP;
/** Welded course rings — evenly spaced, excluding the shell edges. */
const COURSE_COUNT = 3;

// ============================================================================
// COMPONENT
// ============================================================================

export interface HeroTankCylinderProps {
  /** Fill ratio, 0–1. Values outside the range are clamped. */
  ratio: number;
  /** Renders the high-level alarm treatment (amber shell + pulse). */
  isAlarm: boolean;
  className?: string;
}

export function HeroTankCylinder({ ratio, isAlarm, className }: HeroTankCylinderProps) {
  const uid = useId();
  const shellId = `${uid}-shell`;
  const liquidId = `${uid}-liquid`;
  const clipId = `${uid}-clip`;

  const clamped = Math.max(0, Math.min(1, ratio));

  // Liquid surface rides up the shell; SVG y grows downward.
  const surfaceY = SHELL_BOTTOM - SHELL_H * clamped;
  const alarmY = SHELL_BOTTOM - SHELL_H * TANK_HIGH_LEVEL_ALARM;
  const hasLiquid = clamped > 0.001;

  const shellStroke = isAlarm ? "var(--amber-safety)" : "var(--border-strong)";

  /** Closed shell outline: down the left wall, around the floor, up the right. */
  const shellPath = [
    `M ${CX - RX} ${SHELL_TOP}`,
    `L ${CX - RX} ${SHELL_BOTTOM}`,
    `A ${RX} ${RY} 0 0 0 ${CX + RX} ${SHELL_BOTTOM}`,
    `L ${CX + RX} ${SHELL_TOP}`,
    `A ${RX} ${RY} 0 0 0 ${CX - RX} ${SHELL_TOP}`,
    "Z",
  ].join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* Cylindrical shading: dark at both walls, specular band left of centre. */}
        <linearGradient id={shellId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(0 0 0 / 0.30)" />
          <stop offset="18%" stopColor="rgb(0 0 0 / 0.10)" />
          <stop offset="38%" stopColor="rgb(255 255 255 / 0.12)" />
          <stop offset="62%" stopColor="rgb(255 255 255 / 0.04)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.32)" />
        </linearGradient>

        {/* Same curvature applied to the liquid so it sits inside the shell. */}
        <linearGradient id={liquidId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(0 0 0 / 0.35)" />
          <stop offset="38%" stopColor="rgb(255 255 255 / 0.16)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.35)" />
        </linearGradient>

        {/* Confines the liquid to the shell, giving it the curved floor for free. */}
        <clipPath id={clipId}>
          <path d={shellPath} />
        </clipPath>
      </defs>

      {/* Empty shell interior */}
      <path d={shellPath} fill="var(--surface-overlay)" />

      {/* Liquid body + meniscus, clipped to the shell */}
      {hasLiquid && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={CX - RX}
            y={surfaceY}
            width={RX * 2}
            height={SHELL_BOTTOM + RY - surfaceY}
            fill="var(--status-flow)"
            style={{ transition: "y 0.2s ease, height 0.2s ease" }}
          />
          <rect
            x={CX - RX}
            y={surfaceY}
            width={RX * 2}
            height={SHELL_BOTTOM + RY - surfaceY}
            fill={`url(#${liquidId})`}
            style={{ transition: "y 0.2s ease, height 0.2s ease" }}
          />
          {/* Meniscus — the liquid surface seen in the same perspective as the roof */}
          <ellipse
            cx={CX}
            cy={surfaceY}
            rx={RX}
            ry={RY}
            fill="var(--status-flow)"
            style={{ transition: "cy 0.2s ease" }}
          />
          <ellipse
            cx={CX}
            cy={surfaceY}
            rx={RX}
            ry={RY}
            fill="rgb(255 255 255 / 0.22)"
            style={{ transition: "cy 0.2s ease" }}
          />
        </g>
      )}

      {/* Cylindrical shading over shell + liquid alike */}
      <path d={shellPath} fill={`url(#${shellId})`} />

      {/* Welded course rings — the detail that says "plate steel", not "bar chart" */}
      <g clipPath={`url(#${clipId})`} stroke="rgb(255 255 255 / 0.10)" strokeWidth="0.75">
        {Array.from({ length: COURSE_COUNT }, (_, i) => {
          const y = SHELL_TOP + (SHELL_H / (COURSE_COUNT + 1)) * (i + 1);
          return <line key={i} x1={CX - RX} y1={y} x2={CX + RX} y2={y} />;
        })}
      </g>

      {/* High-level alarm mark at 95% */}
      <line
        x1={CX - RX}
        y1={alarmY}
        x2={CX + RX}
        y2={alarmY}
        stroke="var(--amber-safety)"
        strokeWidth="0.75"
        strokeDasharray="2 2"
        opacity="0.6"
      />

      {/* Shell outline */}
      <path
        d={shellPath}
        fill="none"
        stroke={shellStroke}
        strokeWidth={isAlarm ? 1.75 : 1.25}
        className={cn(isAlarm && "animate-[pulse-border_1.5s_ease-in-out_infinite]")}
      />

      {/* Roof — drawn last so its rim reads above the shell walls */}
      <ellipse
        cx={CX}
        cy={SHELL_TOP}
        rx={RX}
        ry={RY}
        fill="var(--surface-raised)"
        stroke={shellStroke}
        strokeWidth={isAlarm ? 1.75 : 1.25}
      />
      {/* Roof plating highlight */}
      <ellipse cx={CX} cy={SHELL_TOP} rx={RX * 0.62} ry={RY * 0.55} fill="rgb(255 255 255 / 0.05)" />
    </svg>
  );
}
