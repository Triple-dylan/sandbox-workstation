// Ported from the DropDeployment harness (apps/harness/src/graph/force-sim.ts).
/**
 * CampaignOS d3-force setup — ported from
 * `/tmp/CampaignOS/src/lib/graph/use-force-simulation.ts` (applyScaledForces +
 * elliptical hub orbit). Canvas harness owns the rAF loop; this module owns forces.
 */

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  CHARGE_MAX_DISTANCE,
  COLLIDE_PADDING_ENTITY,
  COLLIDE_PADDING_HUB,
  STRUCTURAL_HUB_DISTANCE,
  VELOCITY_DECAY,
  type ScaledGraphPhysics,
} from './physics-config.ts';

export type ForceSimNode = SimulationNodeDatum & {
  id: string;
  radius: number;
  isHub: boolean;
  isCandidate: boolean;
  isCampaignCenter: boolean;
  degree: number;
  orbitRadius: number;
  orbitAspectY: number;
  hierarchyParentId?: string;
  hierarchyRadius?: number;
  hierarchyAngle?: number;
  hierarchyStrength?: number;
};

export type ForceSimLink = {
  source: string | ForceSimNode;
  target: string | ForceSimNode;
  structural: boolean;
};

/** Keep hierarchy children inside a narrow parent-relative orbital band. */
export function enforceHierarchyOrbits(
  nodes: ForceSimNode[],
  skipId?: string,
  tolerance = 0.14,
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (
      !node.hierarchyParentId ||
      !node.hierarchyRadius ||
      node.id === skipId ||
      (node.fx !== null && node.fx !== undefined)
    )
      continue;
    const parent = byId.get(node.hierarchyParentId);
    if (!parent) continue;
    let dx = (node.x ?? 0) - (parent.x ?? 0);
    let dy = (node.y ?? 0) - (parent.y ?? 0);
    let distance = Math.hypot(dx, dy);
    if (distance < 0.001) {
      const angle = node.hierarchyAngle ?? 0;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      distance = 1;
    }
    const minimum = node.hierarchyRadius * (1 - tolerance);
    const maximum = node.hierarchyRadius * (1 + tolerance);
    if (distance >= minimum && distance <= maximum) continue;
    const constrained = Math.max(minimum, Math.min(maximum, distance));
    const ux = dx / distance;
    const uy = dy / distance;
    node.x = (parent.x ?? 0) + ux * constrained;
    node.y = (parent.y ?? 0) + uy * constrained;
    const radialVelocity = (node.vx ?? 0) * ux + (node.vy ?? 0) * uy;
    node.vx = (node.vx ?? 0) - radialVelocity * ux;
    node.vy = (node.vy ?? 0) - radialVelocity * uy;
  }
}

type DriftRef = { current: number };

/**
 * Elliptical radial force — pulls hubs onto an orbit ring squashed on Y so
 * clusters read as tilted ellipses rather than flat circles.
 */
function forceEllipticalRadial(strength: number, driftAngleRef: DriftRef) {
  let nodes: ForceSimNode[] = [];

  function force(alpha: number) {
    const drift = driftAngleRef.current ?? 0;
    const cosD = Math.cos(drift);
    const sinD = Math.sin(drift);
    for (const node of nodes) {
      if (!node.isHub) continue;
      const targetR = node.orbitRadius || STRUCTURAL_HUB_DISTANCE;
      const aspectY = node.orbitAspectY || 0.65;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const rx = x * cosD + y * sinD;
      const ry = (-x * sinD + y * cosD) / aspectY;
      const dist = Math.hypot(rx, ry) || 1;
      const k = ((targetR - dist) / dist) * alpha * strength;
      const fx = rx * k;
      const fy = ry * k * aspectY;
      node.vx = (node.vx ?? 0) + fx * cosD - fy * sinD;
      node.vy = (node.vy ?? 0) + fx * sinD + fy * cosD;
    }
  }

  force.initialize = (n: ForceSimNode[]) => {
    nodes = n;
  };

  return force;
}

/**
 * A child belongs to its immediate parent, not to the global center. This is
 * the filesystem's gravity: folders orbit folders and pages orbit the folder
 * that directly contains them. Semantic links may adjust the orbit, but they
 * cannot collapse the hierarchy into the Brain.
 */
function forceHierarchyOrbit() {
  let nodes: ForceSimNode[] = [];
  let byId = new Map<string, ForceSimNode>();

  function force(alpha: number) {
    for (const node of nodes) {
      if (!node.hierarchyParentId || !node.hierarchyRadius) continue;
      const parent = byId.get(node.hierarchyParentId);
      if (!parent) continue;
      const angle = node.hierarchyAngle ?? 0;
      const targetX = (parent.x ?? 0) + Math.cos(angle) * node.hierarchyRadius;
      const targetY = (parent.y ?? 0) + Math.sin(angle) * node.hierarchyRadius;
      const strength = node.hierarchyStrength ?? 0.34;
      node.vx = (node.vx ?? 0) + (targetX - (node.x ?? 0)) * strength * alpha;
      node.vy = (node.vy ?? 0) + (targetY - (node.y ?? 0)) * strength * alpha;
    }
  }

  force.initialize = (next: ForceSimNode[]) => {
    nodes = next;
    byId = new Map(next.map((node) => [node.id, node]));
  };

  return force;
}

export function applyScaledForces(
  sim: Simulation<ForceSimNode, ForceSimLink>,
  simLinks: ForceSimLink[],
  physics: ScaledGraphPhysics,
  hubOrbit: number,
  hubs: ForceSimNode[],
  driftAngleRef: DriftRef,
): void {
  sim.force(
    'link',
    forceLink<ForceSimNode, ForceSimLink>(simLinks)
      .id((node) => node.id)
      .distance((link) => {
        const source = link.source as ForceSimNode;
        const target = link.target as ForceSimNode;
        if (link.structural) {
          if (
            (source.isHub && target.isCampaignCenter) ||
            (target.isHub && source.isCampaignCenter)
          ) {
            return source.isHub ? source.orbitRadius : target.orbitRadius;
          }
          if ((source.isHub && target.isCandidate) || (target.isHub && source.isCandidate)) {
            return hubOrbit * 0.35;
          }
          const child =
            target.hierarchyParentId === source.id
              ? target
              : source.hierarchyParentId === target.id
                ? source
                : null;
          if (child?.hierarchyRadius) return child.hierarchyRadius;
          return physics.structuralMemberDistance + source.radius + target.radius;
        }
        return physics.relationshipDistance;
      })
      .strength((link) =>
        link.structural ? physics.structuralStrength : physics.relationshipStrength,
      ),
  );
  sim.force(
    'charge',
    forceManyBody<ForceSimNode>()
      .strength((node) => {
        if (node.isCampaignCenter) return 0;
        if (node.isHub) return physics.hubCharge;
        if (node.isCandidate) return physics.candidateCharge;
        return physics.entityChargeBase + node.degree * physics.entityChargePerDegree;
      })
      .distanceMax(CHARGE_MAX_DISTANCE),
  );
  sim.force(
    'collide',
    forceCollide<ForceSimNode>()
      .radius(
        (node) =>
          node.radius +
          (node.isCampaignCenter ? 36 : node.isHub ? COLLIDE_PADDING_HUB : COLLIDE_PADDING_ENTITY),
      )
      .strength(0.9)
      .iterations(2),
  );
  sim.force(
    'x',
    forceX<ForceSimNode>(0).strength((node) => {
      if (node.isCampaignCenter) return physics.centerPinStrength;
      if (node.isHub || node.hierarchyParentId) return 0;
      if (node.isCandidate) return physics.candidateCenterPull;
      return physics.centerPull;
    }),
  );
  sim.force(
    'y',
    forceY<ForceSimNode>(0).strength((node) => {
      if (node.isCampaignCenter) return physics.centerPinStrength;
      if (node.isHub || node.hierarchyParentId) return 0;
      if (node.isCandidate) return physics.candidateCenterPull;
      return physics.centerPull;
    }),
  );
  sim.force(
    'hub-orbit',
    hubs.length > 0 ? forceEllipticalRadial(physics.hubRadialStrength * 1.35, driftAngleRef) : null,
  );
  sim.force('hierarchy-orbit', forceHierarchyOrbit());
}

export function createCampaignOsSimulation(
  nodes: ForceSimNode[],
  links: ForceSimLink[],
  physics: ScaledGraphPhysics,
  driftAngleRef: DriftRef,
): Simulation<ForceSimNode, ForceSimLink> {
  const hubs = nodes.filter((n) => n.isHub);
  const hubOrbit =
    hubs.length > 0
      ? Math.min(
          720,
          Math.max(
            380,
            hubs.reduce((sum, hub) => sum + Math.hypot(hub.x ?? 0, hub.y ?? 0), 0) / hubs.length,
          ),
        )
      : STRUCTURAL_HUB_DISTANCE;

  const sim = forceSimulation<ForceSimNode>(nodes)
    .alphaDecay(ALPHA_DECAY)
    .alphaMin(ALPHA_MIN)
    .velocityDecay(VELOCITY_DECAY)
    .stop();

  applyScaledForces(sim, links, physics, hubOrbit, hubs, driftAngleRef);
  return sim as Simulation<ForceSimNode, ForceSimLink>;
}

export function reapplyForces(
  sim: Simulation<ForceSimNode, ForceSimLink>,
  nodes: ForceSimNode[],
  links: ForceSimLink[],
  physics: ScaledGraphPhysics,
  driftAngleRef: DriftRef,
): void {
  const hubs = nodes.filter((n) => n.isHub);
  const hubOrbit =
    hubs.length > 0
      ? Math.min(
          720,
          Math.max(
            380,
            hubs.reduce((sum, hub) => sum + Math.hypot(hub.x ?? 0, hub.y ?? 0), 0) / hubs.length,
          ),
        )
      : STRUCTURAL_HUB_DISTANCE;
  applyScaledForces(sim, links, physics, hubOrbit, hubs, driftAngleRef);
}
