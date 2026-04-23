interface RenderTargetFixed extends Scratch.RenderTarget {
  createComment: any;
}
export interface RuntimeFixed extends Scratch.Runtime {
  getTargetForStage(): RenderTargetFixed;
  emitProjectChanged(): void;
  emitTargetCommentsChanged(targetId: string, content: [string, string, { text: string }]): void;
}

export type TodoPriority = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";

export type TodoStatus = "pending" | "completed";

export interface Todo {
  id: number;
  title: string;
  content: string;
  priority: TodoPriority;
  startTime?: string;
  endTime?: string;
  assigneeIds: string[];
  watcherIds: string[];
  status: TodoStatus;
}
