// Ported from the DropDeployment harness (apps/harness/src/graph), itself a port of CampaignOS.
// Shape comes from these constants; do not retune them for the viewport.
/**
 * CampaignOS graph physics defaults — ported verbatim from
 * `/tmp/CampaignOS/src/lib/graph/graph-physics-config.ts`.
 *
 * Do not "tune for harness viewport". Shape comes from these constants.
 */

/** Member → folder-hub distance (before node radii are added). */
export const STRUCTURAL_MEMBER_DISTANCE = 96;
/** Folder-hub → campaign-centre orbit — the cluster ring. */
export const STRUCTURAL_HUB_DISTANCE = 420;
/** Min / max hub orbit radii for varied constellation spacing. */
export const HUB_ORBIT_MIN = 340;
export const HUB_ORBIT_MAX = 520;
/** Cross-folder relationship links stay long and springy. */
export const RELATIONSHIP_DISTANCE = 230;
/** Structural links are stiff (clusters form); relationships are loose. */
export const STRUCTURAL_STRENGTH = 0.5;
export const RELATIONSHIP_STRENGTH = 0.06;
/** Hubs repel hard so clusters stay airy; entities scale with connectivity. */
export const HUB_CHARGE = -1500;
export const CANDIDATE_CHARGE = -1000;
export const ENTITY_CHARGE_BASE = -160;
export const ENTITY_CHARGE_PER_DEGREE = -18;
export const CHARGE_MAX_DISTANCE = 1200;
/** Label clearance added to each dot's radius for collision. */
export const COLLIDE_PADDING_HUB = 30;
export const COLLIDE_PADDING_ENTITY = 16;
/** Weak pull toward the canvas origin so the graph never drifts away. */
export const CENTER_PULL = 0.04;
export const CANDIDATE_CENTER_PULL = 0.14;
/** Gentle radial force keeping folder hubs on their orbit ring. */
export const HUB_RADIAL_STRENGTH = 0.14;
/** Campaign centre is pinned — strongest centripetal hold. */
export const CENTER_PIN_STRENGTH = 0.55;
/** Settle pacing: ~1.5–2s of visible organic motion, then sleep. */
export const ALPHA_DECAY = 0.045;
export const ALPHA_MIN = 0.005;
export const VELOCITY_DECAY = 0.32;
/** Gentle re-heat when the visible node set changes (view mode, growth). */
export const DATA_CHANGE_ALPHA = 0.35;
/** Drag keeps the local neighbourhood simmering until release. */
export const DRAG_ALPHA_TARGET = 0.3;
/** Hard cap for the synchronous (reduced-motion) settle. */
export const MAX_SYNC_TICKS = 320;
/** Alpha target when user adjusts force sliders. */
export const FORCE_CHANGE_ALPHA = 0.4;
/** Idle orbital drift (rad/s) — CampaignOS simmer. */
export const IDLE_DRIFT_RAD_PER_SEC = 0.012;
/** Soft alpha kept alive by idle drift. */
export const IDLE_SIMMER_ALPHA = 0.008;

export const OBSIDIAN_FORCE_DEFAULTS = {
  centerStrength: 0.5,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
} as const;

/** User-facing force slider defaults — calibrated to CampaignOS layout. */
export const DEFAULT_GRAPH_FORCE_SLIDERS = {
  centerStrength: CENTER_PIN_STRENGTH,
  repelStrength: OBSIDIAN_FORCE_DEFAULTS.repelStrength,
  linkStrength: OBSIDIAN_FORCE_DEFAULTS.linkStrength,
  linkDistance: OBSIDIAN_FORCE_DEFAULTS.linkDistance,
} as const;

export type GraphForceSliders = {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
};

export type ScaledGraphPhysics = {
  structuralMemberDistance: number;
  structuralHubDistance: number;
  relationshipDistance: number;
  structuralStrength: number;
  relationshipStrength: number;
  hubCharge: number;
  candidateCharge: number;
  entityChargeBase: number;
  entityChargePerDegree: number;
  centerPull: number;
  candidateCenterPull: number;
  hubRadialStrength: number;
  centerPinStrength: number;
};

export function scalePhysicsForUserForces(forces: GraphForceSliders): ScaledGraphPhysics {
  const centerScale = forces.centerStrength / DEFAULT_GRAPH_FORCE_SLIDERS.centerStrength;
  const repelScale = forces.repelStrength / DEFAULT_GRAPH_FORCE_SLIDERS.repelStrength;
  const linkScale = forces.linkStrength / DEFAULT_GRAPH_FORCE_SLIDERS.linkStrength;
  const distanceScale = forces.linkDistance / DEFAULT_GRAPH_FORCE_SLIDERS.linkDistance;

  return {
    structuralMemberDistance: STRUCTURAL_MEMBER_DISTANCE * distanceScale,
    structuralHubDistance: STRUCTURAL_HUB_DISTANCE * distanceScale,
    relationshipDistance: RELATIONSHIP_DISTANCE * distanceScale,
    structuralStrength: STRUCTURAL_STRENGTH * linkScale,
    relationshipStrength: RELATIONSHIP_STRENGTH * linkScale,
    hubCharge: HUB_CHARGE * repelScale,
    candidateCharge: CANDIDATE_CHARGE * repelScale,
    entityChargeBase: ENTITY_CHARGE_BASE * repelScale,
    entityChargePerDegree: ENTITY_CHARGE_PER_DEGREE * repelScale,
    centerPull: CENTER_PULL * centerScale,
    candidateCenterPull: CANDIDATE_CENTER_PULL * centerScale,
    hubRadialStrength: HUB_RADIAL_STRENGTH * centerScale,
    centerPinStrength: CENTER_PIN_STRENGTH * centerScale,
  };
}

export const DEFAULT_GRAPH_PHYSICS = scalePhysicsForUserForces(DEFAULT_GRAPH_FORCE_SLIDERS);

/** CampaignOS seed layout — from `to-react-flow.ts`. */
export const BASE_CLUSTER_RADIUS = 460;
export const INTRA_CLUSTER_SPACING = 104;
export const HUB_MEMBER_SPACING = 158;
export const MAX_RING_RADIUS = 220;
export const SECOND_RING_GAP = 108;

export function clusterRadiusFor(folderCount: number): number {
  return BASE_CLUSTER_RADIUS + Math.max(0, folderCount - 6) * 64;
}

/**
 * Diameter (px) of a node's dot — CampaignOS `getNodeDiameter`.
 */
export function getNodeDiameter(
  degree: number,
  isFolderHub = false,
  isCampaignCenter = false,
  sizeMultiplier = 1,
): number {
  if (isCampaignCenter) return Math.round(58 * sizeMultiplier);
  if (isFolderHub) return Math.round(46 * sizeMultiplier);
  const scaled = 15 + Math.sqrt(Math.max(0, degree)) * 7;
  return Math.round(Math.min(36, Math.max(15, scaled)) * sizeMultiplier);
}

export function hubOrbitRadius(nodeId: string, fallback = STRUCTURAL_HUB_DISTANCE): number {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) | 0;
  }
  const t = (((hash % 1000) + 1000) % 1000) / 1000;
  return HUB_ORBIT_MIN + t * (HUB_ORBIT_MAX - HUB_ORBIT_MIN) || fallback;
}

/** Per-hub Y squash for elliptical orbits — pseudo-3D constellation feel. */
export function hubOrbitAspectY(nodeId: string): number {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash * 17 + nodeId.charCodeAt(i)) | 0;
  }
  const t = (((hash % 1000) + 1000) % 1000) / 1000;
  return 0.52 + t * 0.28;
}
