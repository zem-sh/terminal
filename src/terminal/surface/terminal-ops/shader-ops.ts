import type { TerminalSurface } from "../terminal-pane-handle";
import type { TerminalShaderStage } from "../../runtime/types";
import {
  cloneShaderStages,
  normalizeShaderStage,
  normalizeShaderStages,
  sortShaderStages,
} from "../../runtime/shader-stages";

export type TerminalRenderStageHandle = {
  id: string;
  setUniforms: (uniforms: number[]) => void;
  setEnabled: (value: boolean) => void;
  dispose: () => void;
};

export type TerminalManagedShaderStage = {
  id: string;
  stage: TerminalShaderStage;
  order: number;
};

type TerminalShaderOpsDeps = {
  getPanes: () => TerminalSurface[];
  getPaneById: (id: number) => TerminalSurface | null;
};

export class TerminalShaderOps {
  private readonly paneBaseShaderStages = new Map<number, TerminalShaderStage[]>();
  private readonly globalShaderStages = new Map<string, TerminalManagedShaderStage>();
  private nextShaderStageOrder = 1;
  private readonly deps: TerminalShaderOpsDeps;

  constructor(deps: TerminalShaderOpsDeps, shaderStages?: TerminalShaderStage[]) {
    this.deps = deps;
    if (shaderStages?.length) {
      const normalized = sortShaderStages(normalizeShaderStages(shaderStages));
      for (let i = 0; i < normalized.length; i += 1) {
        const stage = normalized[i];
        this.globalShaderStages.set(stage.id, {
          id: stage.id,
          stage,
          order: this.nextShaderStageOrder++,
        });
      }
    }
  }

  setShaderStages(stages: TerminalShaderStage[]): void {
    this.globalShaderStages.clear();
    const normalized = sortShaderStages(normalizeShaderStages(stages ?? []));
    for (let i = 0; i < normalized.length; i += 1) {
      const stage = normalized[i];
      this.globalShaderStages.set(stage.id, {
        id: stage.id,
        stage,
        order: this.nextShaderStageOrder++,
      });
    }
    this.syncPaneShaderStages();
  }

  getShaderStages(): TerminalShaderStage[] {
    return cloneShaderStages(this.listGlobalShaderStages().map((entry) => entry.stage));
  }

  addShaderStage(stage: TerminalShaderStage): TerminalRenderStageHandle {
    const normalized = normalizeShaderStage(stage);
    this.globalShaderStages.set(normalized.id, {
      id: normalized.id,
      stage: normalized,
      order: this.nextShaderStageOrder++,
    });
    this.syncPaneShaderStages();
    return {
      id: normalized.id,
      setUniforms: (uniforms: number[]) => {
        const current = this.globalShaderStages.get(normalized.id);
        if (!current) return;
        const next = normalizeShaderStage({
          ...current.stage,
          uniforms,
        });
        this.globalShaderStages.set(normalized.id, {
          ...current,
          stage: next,
        });
        this.syncPaneShaderStages();
      },
      setEnabled: (value: boolean) => {
        const current = this.globalShaderStages.get(normalized.id);
        if (!current) return;
        const next = normalizeShaderStage({
          ...current.stage,
          enabled: Boolean(value),
        });
        this.globalShaderStages.set(normalized.id, {
          ...current,
          stage: next,
        });
        this.syncPaneShaderStages();
      },
      dispose: () => {
        this.removeShaderStage(normalized.id);
      },
    };
  }

  removeShaderStage(id: string): boolean {
    const stageId = id?.trim?.() ?? "";
    if (!stageId) return false;
    const removed = this.globalShaderStages.delete(stageId);
    if (removed) {
      this.syncPaneShaderStages();
    }
    return removed;
  }

  normalizePaneShaderStages(
    stages: TerminalShaderStage[] | undefined,
    paneId: number,
  ): TerminalShaderStage[] {
    if (!stages?.length) return [];
    try {
      return sortShaderStages(normalizeShaderStages(stages));
    } catch (error) {
      console.warn(`[terminal shader-stage] invalid pane stage config for pane ${paneId}:`, error);
      return [];
    }
  }

  setPaneBaseShaderStages(paneId: number, stages: TerminalShaderStage[]): void {
    this.paneBaseShaderStages.set(paneId, stages);
  }

  removePaneBaseShaderStages(paneId: number): void {
    this.paneBaseShaderStages.delete(paneId);
  }

  buildMergedShaderStages(baseStages: TerminalShaderStage[]): TerminalShaderStage[] {
    const merged = new Map<string, TerminalShaderStage>();
    for (let i = 0; i < baseStages.length; i += 1) {
      const stage = baseStages[i];
      merged.set(stage.id, stage);
    }
    const globals = this.listGlobalShaderStages();
    for (let i = 0; i < globals.length; i += 1) {
      const stage = globals[i].stage;
      if (merged.has(stage.id)) merged.delete(stage.id);
      merged.set(stage.id, stage);
    }
    return sortShaderStages(Array.from(merged.values()));
  }

  syncPaneShaderStages(paneId?: number): void {
    const panes: TerminalSurface[] = [];
    if (paneId === undefined) {
      panes.push(...this.deps.getPanes());
    } else {
      const pane = this.deps.getPaneById(paneId);
      if (pane) panes.push(pane);
    }
    for (let i = 0; i < panes.length; i += 1) {
      const pane = panes[i];
      const base = this.paneBaseShaderStages.get(pane.id) ?? [];
      pane.app.setShaderStages(this.buildMergedShaderStages(base));
    }
  }

  clear(): void {
    this.globalShaderStages.clear();
    this.paneBaseShaderStages.clear();
  }

  private listGlobalShaderStages(): TerminalManagedShaderStage[] {
    return Array.from(this.globalShaderStages.values()).sort((a, b) => a.order - b.order);
  }
}
