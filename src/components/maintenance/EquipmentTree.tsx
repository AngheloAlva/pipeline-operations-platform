"use client";

/**
 * EquipmentTree — ARIA tree with 3 fixed levels (SR-206).
 *
 * Level 1: Stations
 * Level 2: Equipment type categories (Spanish labels)
 * Level 3: Individual equipment items
 *
 * Keyboard model (SR-206 §5, design ADR-4):
 *   Down/Up — next/prev visible node
 *   Right    — expand collapsed / descend to first child
 *   Left     — collapse expanded / ascend to parent
 *   Enter/Space — select equipment node (level-3)
 *   Home/End — first/last visible node
 *
 * Selection: level-3 → selectEntity(EQUIPMENT); level-1/2 → clearSelection + setBoardFilter.
 * No third-party tree library.
 */

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useWorldData } from "@/hooks/useWorldData";
import {
  deriveEquipmentTree,
  deriveMaintenanceBoardRows,
  TaskStatus,
} from "@/lib/maintenance/selectors";
import type { EquipmentTreeNode } from "@/lib/maintenance/selectors";
import { useMaintenanceStore } from "@/store/maintenanceStore";
import { useSelectionStore, EntityType } from "@/store/selectionStore";
import type { EquipmentType } from "@/lib/domain";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Spanish labels for EquipmentType (SR-206 §2)
// ---------------------------------------------------------------------------

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  PUMP: "Bombas",
  AGITATOR: "Agitadores",
  VALVE: "Válvulas",
  RECTIFIER: "Rectificadores",
  MOTOR: "Motores",
  TRANSFORMER: "Transformadores",
  OTHER: "Otros",
};

// ---------------------------------------------------------------------------
// Status derivation helpers
// ---------------------------------------------------------------------------

/** Worst status order: OVERDUE > UPCOMING > OK */
const STATUS_ORDER: Record<string, number> = {
  OVERDUE: 2,
  UPCOMING: 1,
  OK: 0,
};

function worstStatus(
  statuses: string[],
): "OVERDUE" | "UPCOMING" | "OK" {
  let best = 0;
  for (const s of statuses) {
    const rank = STATUS_ORDER[s] ?? 0;
    if (rank > best) best = rank;
  }
  if (best === 2) return "OVERDUE";
  if (best === 1) return "UPCOMING";
  return "OK";
}

function taskStatusToVariant(
  status: "OVERDUE" | "UPCOMING" | "OK",
): StatusBadgeVariant {
  if (status === "OVERDUE") return "overdue";
  if (status === "UPCOMING") return "upcoming";
  return "ok";
}

// ---------------------------------------------------------------------------
// Flatten visible nodes for keyboard navigation
// ---------------------------------------------------------------------------

interface FlatNode {
  node: EquipmentTreeNode;
  depth: number;
  parentId: string | null;
}

function flattenVisible(
  nodes: EquipmentTreeNode[],
  expandedSet: Set<string>,
  depth = 0,
  parentId: string | null = null,
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({ node, depth, parentId });
    if (expandedSet.has(node.id) && node.children.length > 0) {
      result.push(...flattenVisible(node.children, expandedSet, depth + 1, node.id));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Single tree node renderer
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: EquipmentTreeNode;
  depth: number;
  parentId: string | null;
  isExpanded: boolean;
  isSelected: boolean;
  tabIndex: number;
  statusVariant: StatusBadgeVariant;
  onToggle: (id: string) => void;
  onSelect: (node: EquipmentTreeNode) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, node: EquipmentTreeNode) => void;
  nodeRef: (el: HTMLElement | null, id: string) => void;
  children?: React.ReactNode;
}

function TreeNode({
  node,
  depth,
  isExpanded,
  isSelected,
  tabIndex,
  statusVariant,
  onToggle,
  onSelect,
  onKeyDown,
  nodeRef,
  children,
}: TreeNodeProps) {
  const isLeaf = node.level === 3;
  const hasChildren = node.children.length > 0;

  // Indentation — 16px per level
  const paddingLeft = 8 + depth * 16;

  function handleClick() {
    if (isLeaf) {
      onSelect(node);
    } else {
      onToggle(node.id);
      onSelect(node);
    }
  }

  // Expand/collapse chevron for branch nodes
  const Chevron = hasChildren ? (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block w-3 h-3 flex-shrink-0 text-ink-muted transition-transform",
        isExpanded ? "rotate-90" : "",
      )}
    >
      ▶
    </span>
  ) : (
    <span className="inline-block w-3" aria-hidden="true" />
  );

  const label =
    node.level === 2
      ? (EQUIPMENT_TYPE_LABELS[node.equipmentType ?? ""] ?? node.label)
      : node.label;

  return (
    <div
      ref={(el) => nodeRef(el, node.id)}
      role="treeitem"
      aria-expanded={node.level < 3 ? isExpanded : undefined}
      aria-selected={isSelected}
      aria-level={node.level}
      tabIndex={tabIndex}
      data-treeid={node.id}
      onClick={handleClick}
      onKeyDown={(e) => onKeyDown(e, node)}
      style={{ paddingLeft }}
      className={cn(
        "flex flex-col",
        "border-b border-border-subtle",
        "focus:outline-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 pr-3 text-sm cursor-pointer select-none",
          "focus:bg-surface-interactive",
          "hover:bg-surface-interactive",
          isSelected
            ? "bg-accent-dim text-ink-primary"
            : "text-ink-secondary hover:text-ink-primary",
        )}
      >
        {Chevron}
        <span className="flex-1 truncate text-[12px] font-medium tracking-[0.03em]">
          {label}
        </span>
        <StatusBadge variant={statusVariant} className="ml-auto text-[9px]" />
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EquipmentTree (main component)
// ---------------------------------------------------------------------------

/**
 * ARIA tree with 3 levels (station → category → equipment).
 * Level-3 nodes select the equipment in selectionStore.
 * Level-1/2 nodes clear selectionStore and set the board filter in maintenanceStore.
 * Keyboard: Down/Up/Left/Right/Home/End/Enter/Space.
 */
export function EquipmentTree() {
  const { world } = useWorldData();
  const setBoardFilter = useMaintenanceStore((s) => s.setBoardFilter);
  const activeBoardFilter = useMaintenanceStore((s) => s.activeBoardFilter);
  const overrides = useMaintenanceStore((s) => s.overrides);
  const now = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  const selectEntity = useSelectionStore((s) => s.selectEntity);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectedEntityId = useSelectionStore((s) => s.selectedEntityId);
  const selectedEntityType = useSelectionStore((s) => s.selectedEntityType);

  // Expansion state — all level-1 expanded by default
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!world) return new Set();
    return new Set(world.stations.map((s) => s.id));
  });

  // Active (focused) node id for roving tabindex
  const [activeId, setActiveId] = useState<string | null>(null);

  // Ref map: id → DOM element
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  function nodeRef(el: HTMLElement | null, id: string) {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }

  // Derive tree structure
  const treeNodes = useMemo(
    () => (world ? deriveEquipmentTree(world) : []),
    [world],
  );

  // Derive board rows for status propagation (memoized)
  const boardRows = useMemo(
    () => (world ? deriveMaintenanceBoardRows(world, now, overrides) : []),
    [world, now, overrides],
  );

  // Build status maps: equipment → worst status
  const equipmentStatus = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of boardRows) {
      const current = map.get(row.equipmentId);
      const rank = STATUS_ORDER[row.taskStatus] ?? 0;
      const currentRank = current ? (STATUS_ORDER[current] ?? 0) : -1;
      if (rank > currentRank) map.set(row.equipmentId, row.taskStatus);
    }
    return map;
  }, [boardRows]);

  /** Get worst status for a node (recursively aggregated) */
  // Declared as a regular function so recursive calls reference the function
  // by name after it is hoisted — avoids the lint "accessed before declaration"
  // issue that useCallback + self-reference triggers in strict mode.
  function getNodeStatus(node: EquipmentTreeNode): "OVERDUE" | "UPCOMING" | "OK" {
    if (node.level === 3 && node.equipmentId) {
      const s = equipmentStatus.get(node.equipmentId);
      if (s === TaskStatus.OVERDUE) return "OVERDUE";
      if (s === TaskStatus.UPCOMING) return "UPCOMING";
      return "OK";
    }
    // Aggregate children
    const childStatuses = node.children.map((c) => getNodeStatus(c));
    return worstStatus(childStatuses);
  }

  // Flat visible node list for keyboard nav
  const flatVisible = useMemo(
    () => flattenVisible(treeNodes, expanded),
    [treeNodes, expanded],
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function focusNode(id: string) {
    setActiveId(id);
    const el = nodeRefs.current.get(id);
    el?.focus();
  }

  function handleSelect(node: EquipmentTreeNode) {
    if (node.level === 3 && node.equipmentId) {
      // Equipment leaf: select in selectionStore (SR-206 §6)
      selectEntity(node.equipmentId, EntityType.EQUIPMENT);
      // Also set board filter for equipment
      setBoardFilter({
        selectionId: node.equipmentId,
        selectionLevel: "equipment",
        stationId: node.stationId,
        selectionEquipmentType: node.equipmentType,
      });
    } else if (node.level === 1) {
      // Station node: clear equipment selection so board filter takes effect (CRITICAL-2)
      clearSelection();
      setBoardFilter({
        selectionId: node.id,
        selectionLevel: "station",
        stationId: node.id,
        selectionEquipmentType: undefined,
      });
    } else if (node.level === 2) {
      // Category node: clear equipment selection so board filter takes effect (CRITICAL-2)
      clearSelection();
      setBoardFilter({
        selectionId: node.id,
        selectionLevel: "category",
        stationId: node.stationId,
        selectionEquipmentType: node.equipmentType as EquipmentType,
      });
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLElement>, node: EquipmentTreeNode) {
    const currentIndex = flatVisible.findIndex((fn) => fn.node.id === node.id);

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (currentIndex < flatVisible.length - 1) {
          focusNode(flatVisible[currentIndex + 1].node.id);
        }
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (currentIndex > 0) {
          focusNode(flatVisible[currentIndex - 1].node.id);
        }
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (node.children.length > 0) {
          if (!expanded.has(node.id)) {
            // Expand collapsed node
            setExpanded((prev) => new Set([...prev, node.id]));
          } else {
            // Move to first child
            const firstChild = flatVisible.find(
              (fn, idx) => idx > currentIndex && fn.parentId === node.id,
            );
            if (firstChild) focusNode(firstChild.node.id);
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (node.children.length > 0 && expanded.has(node.id)) {
          // Collapse expanded node
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(node.id);
            return next;
          });
        } else {
          // Move to parent
          const current = flatVisible[currentIndex];
          if (current.parentId) focusNode(current.parentId);
        }
        break;
      }
      case "Home": {
        e.preventDefault();
        if (flatVisible.length > 0) focusNode(flatVisible[0].node.id);
        break;
      }
      case "End": {
        e.preventDefault();
        if (flatVisible.length > 0)
          focusNode(flatVisible[flatVisible.length - 1].node.id);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        if (node.level === 3) {
          handleSelect(node);
        } else {
          toggleExpand(node.id);
          handleSelect(node);
        }
        break;
      }
    }
  }

  if (!world) return null;

  return (
    <div
      role="tree"
      aria-label="Árbol de equipos"
      className="flex flex-col overflow-y-auto"
    >
      {treeNodes.map((station) => {
        const stationStatus = getNodeStatus(station);
        const stationExpanded = expanded.has(station.id);
        // Station is highlighted when activeBoardFilter targets this station (WARNING-3)
        const stationSelected =
          selectedEntityType !== EntityType.EQUIPMENT &&
          activeBoardFilter.selectionId === station.id &&
          activeBoardFilter.selectionLevel === "station";
        const stationActive = activeId === station.id;

        return (
          <TreeNode
            key={station.id}
            node={station}
            depth={0}
            parentId={null}
            isExpanded={stationExpanded}
            isSelected={stationSelected}
            tabIndex={stationActive || (activeId === null && station === treeNodes[0]) ? 0 : -1}
            statusVariant={taskStatusToVariant(stationStatus)}
            onToggle={toggleExpand}
            onSelect={(node) => { focusNode(node.id); handleSelect(node); }}
            onKeyDown={handleKeyDown}
            nodeRef={nodeRef}
          >
            {stationExpanded && (
              <div role="group">
                {station.children.map((category) => {
                  const catStatus = getNodeStatus(category);
                  const catExpanded = expanded.has(category.id);
                  const catActive = activeId === category.id;
                  // Category is highlighted when activeBoardFilter targets this category (WARNING-3)
                  const catSelected =
                    selectedEntityType !== EntityType.EQUIPMENT &&
                    activeBoardFilter.selectionId === category.id &&
                    activeBoardFilter.selectionLevel === "category";

                  return (
                    <TreeNode
                      key={category.id}
                      node={category}
                      depth={1}
                      parentId={station.id}
                      isExpanded={catExpanded}
                      isSelected={catSelected}
                      tabIndex={catActive ? 0 : -1}
                      statusVariant={taskStatusToVariant(catStatus)}
                      onToggle={toggleExpand}
                      onSelect={(node) => { focusNode(node.id); handleSelect(node); }}
                      onKeyDown={handleKeyDown}
                      nodeRef={nodeRef}
                    >
                      {catExpanded && (
                        <div role="group">
                          {category.children.map((eqNode) => {
                            const eqStatus = getNodeStatus(eqNode);
                            // Equipment is selected via selectionStore (WARNING-3)
                            const isEqSelected =
                              selectedEntityType === EntityType.EQUIPMENT &&
                              selectedEntityId === eqNode.equipmentId;
                            const eqActive = activeId === eqNode.id;

                            return (
                              <TreeNode
                                key={eqNode.id}
                                node={eqNode}
                                depth={2}
                                parentId={category.id}
                                isExpanded={false}
                                isSelected={isEqSelected}
                                tabIndex={eqActive ? 0 : -1}
                                statusVariant={taskStatusToVariant(eqStatus)}
                                onToggle={toggleExpand}
                                onSelect={(node) => { focusNode(node.id); handleSelect(node); }}
                                onKeyDown={handleKeyDown}
                                nodeRef={nodeRef}
                              />
                            );
                          })}
                        </div>
                      )}
                    </TreeNode>
                  );
                })}
              </div>
            )}
          </TreeNode>
        );
      })}
    </div>
  );
}
