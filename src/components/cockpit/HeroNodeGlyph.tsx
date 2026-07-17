"use client";

/**
 * HeroNodeGlyph — the figure drawn for each node of the crude-movement hero.
 *
 * Every glyph is monoline, drawn around a local origin at (0,0) so the caller
 * only has to translate it into place, and sized to fit inside the ring radius
 * published by HERO_GLYPH_RING_R (the status ring is drawn by the caller).
 *
 * Where a standard figure exists, it is used rather than invented: a pump is
 * the P&ID circle-and-impeller, a manifold is the gate-valve bowtie. The rest
 * (refinery, jetty, vessel) are reduced silhouettes of the source diagram —
 * enough to tell apart at a glance, not enough to become illustration.
 *
 * Presentational and pure: no store access, no data, no state.
 */

import { memo } from "react";
import { HeroGlyph } from "@/lib/diagrams/heroLayout";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Size facts a caller needs to place things around a figure it cannot measure. */
export interface HeroGlyphMetrics {
  /** Radius of the status ring — it must clear the figure's widest point. */
  ringR: number;
  /**
   * Half the figure's drawn height. Labels hang off THIS, not off ringR: the
   * ring is sized by the figure's width, and using it for vertical spacing
   * pushes labels of wide-but-short figures into their neighbours.
   */
  halfH: number;
}

export const HERO_GLYPH_METRICS: Record<HeroGlyph, HeroGlyphMetrics> = {
  [HeroGlyph.INLET]: { ringR: 17, halfH: 12 },
  [HeroGlyph.PUMP_STATION]: { ringR: 22, halfH: 16 },
  [HeroGlyph.MANIFOLD]: { ringR: 20, halfH: 18 },
  [HeroGlyph.REFINERY]: { ringR: 26, halfH: 19 },
  [HeroGlyph.JETTY]: { ringR: 26, halfH: 17 },
  [HeroGlyph.VESSEL]: { ringR: 26, halfH: 18 },
};

// ============================================================================
// COMPONENT
// ============================================================================

export interface HeroNodeGlyphProps {
  glyph: HeroGlyph;
  isSelected: boolean;
}

export const HeroNodeGlyph = memo(function HeroNodeGlyph({
  glyph,
  isSelected,
}: HeroNodeGlyphProps) {
  // Figures are drawn in ink, not in --border-* : the border tokens are low-alpha
  // whites meant to separate panels, and at that contrast a silhouette reads as
  // a smudge. Ink tokens are opaque and invert with the theme.
  const stroke = isSelected ? "var(--amber-safety)" : "var(--ink-secondary)";
  const fill = isSelected ? "var(--amber-safety)" : "var(--surface-raised)";
  /** Solid accents (impeller, arrowheads, hull) read as mass, not outline. */
  const solid = isSelected ? "var(--amber-safety)" : "var(--ink-tertiary)";

  const line = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;

  switch (glyph) {
    // ── Third-party entry: crude leaves a header into our pipe ──────────────
    case HeroGlyph.INLET:
      return (
        <g>
          {/* Header the branch tees off */}
          <line x1={-11} y1={-12} x2={-11} y2={12} {...line} />
          {/* Branch stub */}
          <line x1={-11} y1={0} x2={4} y2={0} {...line} />
          {/* Arrowhead — direction of custody transfer, into the system */}
          <polygon points="4,-6 14,0 4,6" fill={solid} />
        </g>
      );

    // ── Custody tank farm, drawn as its transfer pump (ISA: circle + impeller)
    case HeroGlyph.PUMP_STATION:
      return (
        <g>
          <circle cx={0} cy={0} r={16} fill={fill} stroke={stroke} strokeWidth={2} />
          {/* Impeller, discharging right */}
          <polygon points="-6,-7 8,0 -6,7" fill={solid} />
        </g>
      );

    // ── Custody valve: two seats meeting at the stem (gate-valve bowtie) ────
    case HeroGlyph.MANIFOLD:
      return (
        <g>
          <polygon points="-14,-10 0,0 -14,10" fill={fill} stroke={stroke} strokeWidth={2} />
          <polygon points="14,-10 0,0 14,10" fill={fill} stroke={stroke} strokeWidth={2} />
          {/* Stem + handwheel */}
          <line x1={0} y1={0} x2={0} y2={-16} {...line} />
          <line x1={-7} y1={-16} x2={7} y2={-16} {...line} />
        </g>
      );

    // ── Refinery: two fractionating columns and a flare stack ───────────────
    // The columns are domed and tied by a pipe rack on purpose: bare rectangles
    // of differing height plus a triangle read as a bar chart with a trend
    // arrow, which is the one thing this node must not be mistaken for.
    case HeroGlyph.REFINERY:
      return (
        <g>
          {/* Tall column — domed head */}
          <path
            d="M -17 14 L -17 -12 A 5.5 5.5 0 0 1 -6 -12 L -6 14 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* Tray rings */}
          <line x1={-17} y1={-4} x2={-6} y2={-4} {...line} strokeWidth={1} />
          <line x1={-17} y1={4} x2={-6} y2={4} {...line} strokeWidth={1} />
          {/* Short column — domed head */}
          <path
            d="M -1 14 L -1 -3 A 5 5 0 0 1 9 -3 L 9 14 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <line x1={-1} y1={6} x2={9} y2={6} {...line} strokeWidth={1} />
          {/* Pipe rack tying the columns together — plant, not chart */}
          <line x1={-11.5} y1={-16} x2={4} y2={-16} {...line} strokeWidth={1.5} />
          <line x1={-11.5} y1={-16} x2={-11.5} y2={-12} {...line} strokeWidth={1.5} />
          <line x1={4} y1={-16} x2={4} y2={-3} {...line} strokeWidth={1.5} />
          {/* Flare stack with a flame, not an arrowhead */}
          <line x1={16} y1={14} x2={16} y2={-10} {...line} strokeWidth={1.75} />
          <path d="M 16 -19 q 4.5 4.5 2.5 7.5 q -2.5 3.5 -5 0 q -2 -3 2.5 -7.5 Z" fill={solid} />
          {/* Grade */}
          <line x1={-21} y1={14} x2={21} y2={14} {...line} />
        </g>
      );

    // ── Marine terminal: a jetty on piles reaching over the water ───────────
    case HeroGlyph.JETTY:
      return (
        <g>
          {/* Deck */}
          <line x1={-18} y1={-2} x2={18} y2={-2} {...line} />
          {/* Piles */}
          <line x1={-12} y1={-2} x2={-12} y2={10} {...line} />
          <line x1={0} y1={-2} x2={0} y2={10} {...line} />
          <line x1={12} y1={-2} x2={12} y2={10} {...line} />
          {/* Loading arm on the deck */}
          <line x1={-4} y1={-2} x2={-4} y2={-16} {...line} />
          <line x1={-4} y1={-16} x2={7} y2={-16} {...line} />
          <line x1={7} y1={-16} x2={7} y2={-9} {...line} />
          {/* Water */}
          <path d="M -20 14 q 5 -4 10 0 q 5 4 10 0 q 5 -4 10 0" {...line} strokeWidth={1.5} />
        </g>
      );

    // ── Tanker: hull, deckhouse, mast, waterline ───────────────────────────
    case HeroGlyph.VESSEL:
      return (
        <g>
          {/* Hull — flared bow to the right, transom to the left */}
          <path d="M -18 -2 L 18 -2 L 12 9 L -12 9 Z" fill={solid} stroke={stroke} strokeWidth={1.5} />
          {/* Deckhouse */}
          <rect x={-15} y={-11} width={9} height={9} fill={fill} stroke={stroke} strokeWidth={1.75} />
          {/* Mast */}
          <line x1={-10.5} y1={-11} x2={-10.5} y2={-18} {...line} strokeWidth={1.5} />
          {/* Manifold crane amidships */}
          <line x1={4} y1={-2} x2={4} y2={-10} {...line} strokeWidth={1.5} />
          {/* Water */}
          <path d="M -20 13 q 5 -4 10 0 q 5 4 10 0 q 5 -4 10 0" {...line} strokeWidth={1.5} />
        </g>
      );
  }
});
