interface RenderTargetFixed extends Scratch.RenderTarget {
  createComment: any;
}
export interface RuntimeFixed extends Scratch.Runtime {
  getTargetForStage(): RenderTargetFixed;
  emitProjectChanged(): void;
  emitTargetCommentsChanged(targetId: string, content: [string, string, { text: string }]): void;
}

export interface Todo {
  id: number;
  content: string;
  picOid?: string; // 负责人ID
}
