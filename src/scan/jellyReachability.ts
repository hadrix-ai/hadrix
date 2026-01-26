import type { AnchorIndex, AnchorLookup } from "./jellyAnchors.js";
import type { EntryPointCandidate } from "./entryPoints.js";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ENTRYPOINTS = 3;

export type ReachabilityInfo = {
  entry_points: string[];
  min_depth: number | null;
};

export type ReachabilityIndex = {
  entryPoints: EntryPointCandidate[];
  getReachability: (lookup: AnchorLookup) => ReachabilityInfo | null;
};

type QueueEntry = {
  functionId: string;
  entryPoint: string;
  depth: number;
};

export function buildJellyReachabilityIndex(params: {
  anchorIndex: AnchorIndex;
  entryPoints: EntryPointCandidate[];
  repoPath?: string | null;
  maxDepth?: number;
  maxEntryPointsPerNode?: number;
}): ReachabilityIndex | null {
  const callGraph = params.anchorIndex.callGraph;
  if (!callGraph) return null;

  const entryPointNodes: Array<{ label: string; functionId: string }> = [];
  for (const entryPoint of params.entryPoints) {
    const anchorId = params.anchorIndex.getAnchorId({
      filepath: entryPoint.filepath,
      repoPath: params.repoPath ?? null,
      startLine: entryPoint.startLine,
      endLine: entryPoint.endLine ?? entryPoint.startLine
    });
    if (!anchorId) continue;
    const functionId = callGraph.functionIdByAnchorId.get(anchorId);
    if (!functionId) continue;
    entryPointNodes.push({ label: entryPoint.label, functionId });
  }

  if (entryPointNodes.length === 0) {
    return null;
  }

  const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntryPointsPerNode = params.maxEntryPointsPerNode ?? DEFAULT_MAX_ENTRYPOINTS;
  const reachabilityByFunction = new Map<string, { entryPoints: Set<string>; minDepth: number }>();
  const visited = new Set<string>();
  const queue: QueueEntry[] = [];

  for (const entryPoint of entryPointNodes) {
    queue.push({ functionId: entryPoint.functionId, entryPoint: entryPoint.label, depth: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > maxDepth) continue;
    const visitKey = `${current.entryPoint}::${current.functionId}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    let info = reachabilityByFunction.get(current.functionId);
    if (!info) {
      info = { entryPoints: new Set(), minDepth: current.depth };
      reachabilityByFunction.set(current.functionId, info);
    }
    if (!info.entryPoints.has(current.entryPoint)) {
      if (info.entryPoints.size < maxEntryPointsPerNode) {
        info.entryPoints.add(current.entryPoint);
      }
      if (current.depth < info.minDepth) {
        info.minDepth = current.depth;
      }
    }

    if (current.depth >= maxDepth) continue;
    const callees = callGraph.edgesByCaller.get(current.functionId) ?? [];
    for (const callee of callees) {
      queue.push({ functionId: callee, entryPoint: current.entryPoint, depth: current.depth + 1 });
    }
  }

  const reachabilityByAnchorId = new Map<string, ReachabilityInfo>();
  for (const [functionId, info] of reachabilityByFunction.entries()) {
    const anchorId = callGraph.anchorIdByFunctionId.get(functionId);
    if (!anchorId) continue;
    const entryPoints = Array.from(info.entryPoints);
    const existing = reachabilityByAnchorId.get(anchorId);
    if (existing) {
      const merged = new Set(existing.entry_points);
      for (const entryPoint of entryPoints) {
        if (merged.size >= maxEntryPointsPerNode) break;
        merged.add(entryPoint);
      }
      const minDepth =
        existing.min_depth == null ? info.minDepth : Math.min(existing.min_depth, info.minDepth);
      reachabilityByAnchorId.set(anchorId, {
        entry_points: Array.from(merged),
        min_depth: minDepth
      });
      continue;
    }
    reachabilityByAnchorId.set(anchorId, {
      entry_points: entryPoints,
      min_depth: info.minDepth
    });
  }

  return {
    entryPoints: params.entryPoints,
    getReachability: (lookup: AnchorLookup): ReachabilityInfo | null => {
      const anchorId = params.anchorIndex.getAnchorId(lookup);
      if (!anchorId) return null;
      const info = reachabilityByAnchorId.get(anchorId);
      if (!info || info.entry_points.length === 0) return null;
      return info;
    }
  };
}
