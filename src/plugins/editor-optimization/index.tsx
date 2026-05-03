import * as React from "react";
import ReactDOM from "react-dom";
import styles from "./styles.less";
import ExpansionBox, { ExpansionRect } from "components/ExpansionBox";
import Tooltip from "components/Tooltip";
import toast from "react-hot-toast";
import { Box, Input, IconButton } from "@gandi-ide/gandi-ui";
import {
  getGroups, getActiveGroupId, setActiveGroupId, addGroup, deleteGroup, renameGroup,
  setBlockGroup, getBlockGroup, restoreBlockGroupFromXml, loadFromLocalStorage,
  setGlobalVM, ALL_GROUPS_ID, UNGROUPED_ID
} from "./utils";
import {
  saveTargetToOffscreen,
  restoreTargetFromOffscreen,
  initTargetCacheAndSwitchToGroup,
  switchGroup,
  getOffscreenWorkspace,
  moveBlockTreeToWorkspace,
} from "./offscreenCache";

const AddIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>);
const DeleteIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>);
const CheckIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>);
const GroupIcon = () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>);

const DEFAULT_CONTAINER_INFO = { width: 280, height: 400, translateX: 72, translateY: 60 };

declare global {
  interface Window {
    __EDITOR_OPT_FAST_CLEAR_ENABLED__?: boolean;
    __FAST_CLEAR_MODE__?: boolean;
    __ORIGINAL_DISPOSE_SVG__?: any;
    __ORIGINAL_CLEAR_WS_SVG__?: any;
    __SKIP_LAYOUT_UPDATE__?: boolean;
    __ENABLE_FAST_LOAD__?: boolean;
    __BATCH_VARIABLE_LOAD__?: boolean;
    __FILTER_TOP_BLOCKS_FOR_SERIALIZATION__?: boolean;
    __ENABLE_DRAG_OPTIMIZE__?: boolean;
    __FAST_DRAG_MODE__?: boolean;
    __IN_FULLSCREEN_MODE__?: boolean;
    __ENABLE_FULLSCREEN_OPTIMIZATION__?: boolean;
  }
}

function getRootBlock(block: any): any {
  let r = block;
  while (r?.getParent?.()) r = r.getParent();
  return r;
}

function extractTopLevelBlocks(xmlString: string): Element[] {
  try {
    const doc = new DOMParser().parseFromString(xmlString, "text/xml");
    const root = doc.documentElement;
    if (!root) return [];
    return Array.from(root.children)
      .filter(c => c.tagName.toLowerCase() === 'block')
      .map(c => c.cloneNode(true) as Element);
  } catch {
    return [];
  }
}

const EditorOptimization: React.FC<PluginContext> = ({ vm, blockly, workspace, registerSettings }) => {
  const [visible, setVisible] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [groups, setGroups] = React.useState<any[]>([]);
  const [activeGroupId, setActiveGroupIdState] = React.useState<string>(ALL_GROUPS_ID);
  const [newGroupName, setNewGroupName] = React.useState("");
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [containerInfo, setContainerInfo] = React.useState<ExpansionRect>(DEFAULT_CONTAINER_INFO);
  const containerInfoRef = React.useRef(containerInfo);
  
  // 用于记录上一个编辑目标，以便切出时保存到离屏缓存
  const lastTargetIdRef = React.useRef<string | null>(null);

  React.useEffect(() => { setGlobalVM(vm); }, [vm]);
  React.useEffect(() => { loadFromLocalStorage(); }, []);

  const refreshGroups = React.useCallback(() => {
    if (!targetId) return;
    setGroups(getGroups(targetId));
    setActiveGroupIdState(getActiveGroupId(targetId));
  }, [targetId]);

  React.useEffect(() => {
    const update = () => {
      const id = (vm as any).editingTarget?.id || (vm as any).runtime?._editingTarget?.id || null;
      if (id && id !== targetId) setTargetId(id);
    };
    update();
    const iv = setInterval(update, 200);
    return () => clearInterval(iv);
  }, [vm, targetId]);

  React.useEffect(() => { refreshGroups(); }, [targetId, refreshGroups]);

  const handleClick = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContainerInfo({ ...containerInfoRef.current, translateX: rect.x + 28, translateY: rect.y - 6 });
    setVisible(true);
    refreshGroups();
  };

  // 分组切换：优先使用离屏搬运
  const handleSelectGroup = (groupId: string) => {
    if (!targetId) return;
    if (getOffscreenWorkspace(targetId)) {
      try {
        switchGroup(targetId, groupId, workspace, blockly, getBlockGroup, ALL_GROUPS_ID);
        setActiveGroupIdState(groupId);
        setActiveGroupId(targetId, groupId);
        refreshGroups();
      } catch (e) {
        console.error('离屏分组切换失败', e);
        toast.error('分组切换失败');
      }
      return;
    }
    // 原有逻辑
    setActiveGroupId(targetId, groupId);
    setActiveGroupIdState(groupId);
    (vm as any).emitWorkspaceUpdate?.();
  };

  const handleAddGroup = () => {
    if (!targetId) return;
    if (!newGroupName.trim()) { toast.error("请输入分组名称"); return; }
    addGroup(targetId, newGroupName.trim());
    setNewGroupName("");
    refreshGroups();
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!targetId) return;
    if (groupId === UNGROUPED_ID) { toast.error("默认分组不可删除"); return; }
    deleteGroup(targetId, groupId);
    refreshGroups();
  };

  const startEdit = (id: string, name: string) => { setEditingGroupId(id); setEditingName(name); };
  const saveEdit = () => {
    if (!targetId || !editingGroupId) return;
    if (!editingName.trim()) { toast.error("名称不能为空"); return; }
    renameGroup(targetId, editingGroupId, editingName.trim());
    setEditingGroupId(null);
    setEditingName("");
    refreshGroups();
  };

  //设置注册
  React.useEffect(() => {
    if (!registerSettings) return;
    const dispose = registerSettings(
      '积木分组&编辑器优化',
      'plugin-editor-optimization',
      [
        {
          key: 'group',
          label: '积木分组&编辑器优化',
          description: '提供角色积木分组功能，同时优化编辑器性能。默认开启角色积木区缓存，从第二次进入角色开始提升约100%-200%切换效率。',
          items: [
            {
              key: 'enableFastClear',
              type: 'switch',
              label: '[实验]启用切出优化',
              description: '极大优化切出大型角色时的效率。',
              value: false,
              onChange: (v: boolean) => {
                window.__EDITOR_OPT_FAST_CLEAR_ENABLED__ = v;
              }
            },
            {
              key: 'enableFastLoad',
              type: 'switch',
              label: '[实验]启用切入优化',
              description: '适当优化切入大型角色时的效率。',
              value: false,
              onChange: (v: boolean) => {
                window.__ENABLE_FAST_LOAD__ = v;
              }
            },
            {
              key: 'enableDragOptimize',
              type: 'switch',
              label: '[实验]启用拖拽优化',
              description: '修改拖拽算法，可能优化拖拽积木区时的效率',
              value: false,
              onChange: (v: boolean) => {
                window.__ENABLE_DRAG_OPTIMIZE__ = v;
              }
            },
            {
              key: 'enableFullscreenOptimize',
              type: 'switch',
              label: '[实验]启用全屏优化',
              description: '在舞台全屏时隐藏积木区，减少不必要的积木区渲染开销',
              value: false,
              onChange: (v: boolean) => {
                window.__ENABLE_FULLSCREEN_OPTIMIZATION__ = v;
              }
            }
          ]
        }
      ],
      <GroupIcon />
    );
    return () => dispose.dispose();
  }, [registerSettings]);

  //核心劫持：clearWorkspaceAndLoadFromXml（集成离屏缓存）
  React.useEffect(() => {
    if (!blockly || !workspace || !vm) return;

    const origClear = blockly.Xml?.clearWorkspaceAndLoadFromXml;
    const origDom = blockly.Xml?.domToBlock;
    const origClearWs = blockly.Xml?.clearWorkspace;

    if (!origClear || !origDom) return;

    blockly.Xml.clearWorkspaceAndLoadFromXml = function(xml: any, ...args: any[]) {
      const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
      if (!ct) return origClear.call(this, xml, ...args);
      const newTargetId = ct.id;

      // 切出旧角色：保存到离屏
      if (lastTargetIdRef.current && lastTargetIdRef.current !== newTargetId) {
        try {
          saveTargetToOffscreen(lastTargetIdRef.current, workspace, blockly);
        } catch (e) {
          console.warn('[离屏缓存] 保存旧角色失败', e);
        }
      }
      lastTargetIdRef.current = newTargetId;

      const activeId = getActiveGroupId(newTargetId);
      const tw = workspace || this;

      // 尝试从离屏恢复
      if (getOffscreenWorkspace(newTargetId)) {
        try {
          // 清空主工作区（不 dispose）
          if (window.__EDITOR_OPT_FAST_CLEAR_ENABLED__) {
            tw.clear();
          } else {
            const topBlocks = [...tw.getTopBlocks(false)];
            topBlocks.forEach((b: any) => {
              tw.removeTopBlock(b);
              const svgRoot = b.getSvgRoot();
              if (svgRoot && svgRoot.parentNode) svgRoot.parentNode.removeChild(svgRoot);
            });
            if ((tw as any).connectionDBList) {
              (tw as any).connectionDBList.forEach((db: any) => {
                if (db) db.connections_ = [];
              });
            }
          }

          // 临时屏蔽 resize，并延迟恢复，确保 onWorkspaceUpdate 调用时仍为空函数
          const origResize = tw.resize;
          tw.resize = function() {};
          setTimeout(() => {
            tw.resize = origResize;
          }, 0); // 下一个宏任务恢复，此时外部 resize 调用已结束
          restoreTargetFromOffscreen(
            newTargetId, tw, blockly, activeId,
            getBlockGroup, ALL_GROUPS_ID
          );

          setTimeout(() => refreshGroups(), 20);
          return tw;
        } catch (e) {
          console.error('[离屏缓存] 恢复失败，回退到 XML 加载', e);
        }
      }

      // 无缓存：首次加载，强制全量加载以创建完整缓存
      const originalActiveId = getActiveGroupId(newTargetId);
      setActiveGroupId(newTargetId, ALL_GROUPS_ID);

      let xmlString = typeof xml === 'string' ? xml : new XMLSerializer().serializeToString(xml);
      const doc = new DOMParser().parseFromString(xmlString, "text/xml");
      const root = doc.documentElement;
      if (!root) {
        setActiveGroupId(newTargetId, originalActiveId);
        return origClear.call(this, xml, ...args);
      }

      // 恢复分组信息
      Array.from(root.children)
        .filter(c => c.tagName.toLowerCase() === 'block')
        .forEach(n => restoreBlockGroupFromXml(n as Element, newTargetId));

      // 切入优化 - 延迟布局
      const enableFastLoad = window.__ENABLE_FAST_LOAD__;
      const blockCount = root.querySelectorAll('block').length;
      const shouldOptimize = enableFastLoad && blockCount > 200;

      if (shouldOptimize) {
        window.__SKIP_LAYOUT_UPDATE__ = true;
        const injectionDiv = workspace.getInjectionDiv();
        if (injectionDiv) {
          injectionDiv.classList.add('gandi-fastload-animation');
          injectionDiv.classList.add('gandi-fastload-contain');
        }
      }

      // 清理注释
      if (typeof tw.getTopComments === 'function') {
        const comments = tw.getTopComments(true);
        comments.forEach((comment: any) => {
          if (comment.dispose) comment.dispose();
        });
      } else if ((tw as any).commentDB_) {
        Object.values((tw as any).commentDB_).forEach((comment: any) => {
          if (comment.dispose) comment.dispose();
        });
      }
      const canvas = tw.getCanvas();
      if (canvas) {
        const commentElements = canvas.querySelectorAll('.scratchCommentTopBar, .blocklyComment');
        commentElements.forEach((el: Element) => el.remove());
      }

      const scheduleLayoutReset = () => {
        if (!shouldOptimize) return;
        setTimeout(() => {
          window.__SKIP_LAYOUT_UPDATE__ = false;
          const allBlocks = tw.getAllBlocks(false) as any[];
          for (const block of allBlocks) {
            if (block.rendered) {
              try { block.render(false); } catch (e) {}
            }
          }
          if ((window as any).__FORCE_LAYOUT_UPDATE__) {
            (window as any).__FORCE_LAYOUT_UPDATE__();
          }
          tw.recordCachedAreas?.();
          tw.resize?.();
          const injectionDiv = workspace.getInjectionDiv();
          if (injectionDiv) {
            injectionDiv.classList.remove('gandi-fastload-animation');
            injectionDiv.classList.remove('gandi-fastload-contain');
          }
        }, 80);
      };

      try {
        origClear.call(this, xml, ...args);
      } finally {
        setActiveGroupId(newTargetId, originalActiveId);
      }

      // 初始化离屏缓存
      try {
        initTargetCacheAndSwitchToGroup(
          newTargetId,
          tw,
          blockly,
          originalActiveId,
          getBlockGroup,
          ALL_GROUPS_ID
        );
      } catch (e) {
        console.error('[离屏缓存] 初始化失败', e);
      }

      scheduleLayoutReset();
      setTimeout(() => refreshGroups(), 20);
      return tw;
    };

    const handleCreate = (e: any) => {
      if (e.type !== blockly.Events.BLOCK_CREATE) return;
      const block = workspace.getBlockById(e.blockId) as any;
      if (!block || block.getParent?.()) return;
      const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
      if (!ct) return;
      const activeId = getActiveGroupId(ct.id);
      setBlockGroup(block, activeId === ALL_GROUPS_ID ? UNGROUPED_ID : activeId, ct.id);
    };
    workspace.addChangeListener(handleCreate);

    const ContextMenu = (window as any).Blockly.ContextMenu;
    let menuId: string | null = null;
    if (ContextMenu && typeof ContextMenu.addDynamicMenuItem === 'function') {
      menuId = ContextMenu.addDynamicMenuItem(
        (items: any[], block: any) => {
          if (!block || block.workspace.isFlyout) return items;
          const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
          if (!ct) return items;
          const targetId = ct.id;
          const allGroups = getGroups(targetId);
          if (!allGroups.length) return items;
          
          const root = getRootBlock(block);
          const cur = getBlockGroup(root);
          
          items.push({ separator: true });
          
          allGroups.forEach(g => {
            items.push({
              text: `移动到「${g.name}」${g.id === cur ? ' ✓' : ''}`,
              enabled: g.id !== cur,
              callback: () => {
                try {
                  setBlockGroup(root, g.id, targetId);
                  if (getActiveGroupId(targetId) !== ALL_GROUPS_ID && getActiveGroupId(targetId) !== g.id) {
                  // 优先利用离屏缓存搬走整个积木树，避免与 Gandi 离屏渲染优化冲突
                  const offscreenWs = getOffscreenWorkspace(targetId);
                  if (offscreenWs) {
                    try {
                      // 从主工作区搬回离屏工作区
                      moveBlockTreeToWorkspace(root, workspace, offscreenWs, blockly);
                      // 刷新一下主工作区（轻量）
                      workspace.recordCachedAreas?.();
                      workspace.resizeContents?.();
                    } catch (e) {
                      // 搬运失败时回退到隐藏逻辑
                      const hideBlockStack = (block: any) => {
                        if (!block) return;
                        if (block.getSvgRoot) {
                          const rootSvg = block.getSvgRoot();
                          if (rootSvg) rootSvg.style.display = 'none';
                        }
                        const children = block.getChildren(false);
                        children.forEach((child: any) => hideBlockStack(child));
                      };
                      hideBlockStack(root);
                    }
                  } else {
                    // 无离屏缓存时，维持原有的 display:none 隐藏
                    const hideBlockStack = (block: any) => {
                      if (!block) return;
                      if (block.getSvgRoot) {
                        const rootSvg = block.getSvgRoot();
                        if (rootSvg) rootSvg.style.display = 'none';
                      }
                      const children = block.getChildren(false);
                      children.forEach((child: any) => hideBlockStack(child));
                    };
                    hideBlockStack(root);
                  }
                }
                  toast.success(`已移至「${g.name}」`);
                } catch (e) {
                }
              }
            });
          });
          
          return items;
        },
        { targetNames: ['blocks', 'frame'] }
      );
    }

    return () => {
      if (origClear) blockly.Xml.clearWorkspaceAndLoadFromXml = origClear;
      workspace.removeChangeListener(handleCreate);
      if (menuId && ContextMenu && typeof ContextMenu.deleteDynamicMenuItem === 'function') {
        ContextMenu.deleteDynamicMenuItem(menuId);
      }
    };
  }, [blockly, workspace, vm, refreshGroups]);

  //切出优化-快速清理 (保持不变)
  React.useEffect(() => {
    if (!blockly || !workspace) return;

    const BlocklyAny = blockly as any;
    const WorkspaceSvg = BlocklyAny.WorkspaceSvg?.prototype ? BlocklyAny.WorkspaceSvg : workspace.constructor;
    const BlockSvg = BlocklyAny.BlockSvg?.prototype ? BlocklyAny.BlockSvg : (workspace.newBlock('') as any).constructor;

    if (!window.__ORIGINAL_CLEAR_WS_SVG__) {
      window.__ORIGINAL_CLEAR_WS_SVG__ = WorkspaceSvg.prototype.clear;
    }
    if (!window.__ORIGINAL_DISPOSE_SVG__) {
      window.__ORIGINAL_DISPOSE_SVG__ = BlockSvg.prototype.dispose;
    }

    const origClear = window.__ORIGINAL_CLEAR_WS_SVG__;
    const origDispose = window.__ORIGINAL_DISPOSE_SVG__;

    const utils = BlocklyAny.utils;
    let origRemoveClass: any = null;
    if (utils && utils.removeClass) {
      origRemoveClass = utils.removeClass;
      utils.removeClass = function(element: any, className: string) {
        if (!element) return;
        return origRemoveClass.call(this, element, className);
      };
    }

    BlockSvg.prototype.dispose = function(healStack?: boolean, animate?: boolean) {
      if (window.__FAST_CLEAR_MODE__) {
        const svgGroup = this.svgGroup_;
        this.svgGroup_ = null;
        try {
          return origDispose.call(this, healStack, animate);
        } finally {
          this.svgGroup_ = svgGroup;
        }
      } else {
        return origDispose.call(this, healStack, animate);
      }
    };

    const Connection = BlocklyAny.Connection?.prototype ? BlocklyAny.Connection : (workspace.newBlock('')?.getConnections_(true)?.[0]?.constructor);
    let origConnectionDispose: any = null;
    if (Connection && Connection.prototype.dispose) {
      origConnectionDispose = Connection.prototype.dispose;
      Connection.prototype.dispose = function() {
        if (window.__FAST_CLEAR_MODE__) {
          if (this.sourceBlock_) {
            const connections = this.sourceBlock_.getConnections_(true);
            const idx = connections.indexOf(this);
            if (idx !== -1) connections.splice(idx, 1);
          }
          this.sourceBlock_ = null;
          this.targetConnection = null;
          this.targetBlock_ = null;
          this.connectionDB_ = null;
        } else {
          return origConnectionDispose.call(this);
        }
      };
    }

    const Field = BlocklyAny.Field?.prototype ? BlocklyAny.Field : (() => {
      const dummyBlock = workspace.newBlock('') as any;
      const input = dummyBlock?.inputList?.[0];
      const field = input?.fieldRow?.[0];
      dummyBlock?.dispose(false, false);
      return field?.constructor;
    })();
    let origFieldDispose: any = null;
    if (Field && Field.prototype.dispose) {
      origFieldDispose = Field.prototype.dispose;
      Field.prototype.dispose = function() {
        if (window.__FAST_CLEAR_MODE__) {
          if (this.fieldGroup_) this.fieldGroup_ = null;
          this.sourceBlock_ = null;
          this.workspace_ = null;
          this.validator_ = null;
          this.callback_ = null;
          this.textElement_ = null;
          this.borderRect_ = null;
        } else {
          return origFieldDispose.call(this);
        }
      };
    }

    const Input = BlocklyAny.Input?.prototype ? BlocklyAny.Input : (() => {
      const dummyBlock = workspace.newBlock('') as any;
      const input = dummyBlock?.inputList?.[0];
      dummyBlock?.dispose(false, false);
      return input?.constructor;
    })();
    let origInputDispose: any = null;
    if (Input && Input.prototype.dispose) {
      origInputDispose = Input.prototype.dispose;
      Input.prototype.dispose = function() {
        if (window.__FAST_CLEAR_MODE__) {
          if (this.fieldGroup_) this.fieldGroup_ = null;
          if (this.fieldRow) {
            for (let i = 0; i < this.fieldRow.length; i++) {
              const field = this.fieldRow[i];
              if (field && field.dispose) field.dispose();
            }
            this.fieldRow.length = 0;
          }
          this.sourceBlock_ = null;
          this.connection = null;
        } else {
          return origInputDispose.call(this);
        }
      };
    }

    WorkspaceSvg.prototype.clear = function() {
      const enabled = window.__EDITOR_OPT_FAST_CLEAR_ENABLED__;
      if (!enabled) {
        return origClear.call(this);
      }

      const workspaceSvg = this as any;
      const canvas = workspaceSvg.getCanvas();
      if (!canvas) return origClear.call(this);

      const topBlocks = workspaceSvg.getTopBlocks(true) as any[];

      while (canvas.firstChild) {
        canvas.removeChild(canvas.firstChild);
      }

      window.__FAST_CLEAR_MODE__ = true;
      try {
        if (BlocklyAny.Events) BlocklyAny.Events.disable();
        try {
          workspaceSvg.blockDB_ = Object.create(null);
          workspaceSvg.topBlocks_ = [];
          if (workspaceSvg.commentDB_) {
            workspaceSvg.commentDB_ = Object.create(null);
          }
          const dbList = workspaceSvg.connectionDBList;
          if (dbList) {
            for (let i = 0; i < dbList.length; i++) {
              if (dbList[i]) {
                dbList[i].connections_ = [];
              }
            }
          }
        } finally {
          if (BlocklyAny.Events) BlocklyAny.Events.enable();
        }
      } finally {
        window.__FAST_CLEAR_MODE__ = false;
      }
    };

    return () => {
      WorkspaceSvg.prototype.clear = window.__ORIGINAL_CLEAR_WS_SVG__;
      BlockSvg.prototype.dispose = window.__ORIGINAL_DISPOSE_SVG__;
      if (Connection && origConnectionDispose) Connection.prototype.dispose = origConnectionDispose;
      if (Field && origFieldDispose) Field.prototype.dispose = origFieldDispose;
      if (Input && origInputDispose) Input.prototype.dispose = origInputDispose;
      if (utils && origRemoveClass) utils.removeClass = origRemoveClass;
    };
  }, [blockly, workspace]);

  // 性能测量与序列化过滤
  React.useEffect(() => {
    if (!vm) return;
    const originalSetEditingTarget = (vm as any).setEditingTarget;
    const originalEmitWorkspaceUpdate = (vm as any).emitWorkspaceUpdate;
/*
    if (originalSetEditingTarget) {
      (vm as any).setEditingTarget = function(targetId: string) {
        const start = performance.now();
        console.log(`[性能测量] 开始切换角色: ${targetId}`);
        const result = originalSetEditingTarget.call(this, targetId);
        const end = performance.now();
        console.log(`[性能测量] 切换角色完成，总耗时: ${(end - start).toFixed(2)}ms`);
        return result;
      };
    }
*/
    if (originalEmitWorkspaceUpdate) {
      (vm as any).emitWorkspaceUpdate = function() {
        window.__FILTER_TOP_BLOCKS_FOR_SERIALIZATION__ = true;
        try {
          return originalEmitWorkspaceUpdate.call(this);
        } finally {
          window.__FILTER_TOP_BLOCKS_FOR_SERIALIZATION__ = false;
        }
      };
    }

    return () => {
      if (originalSetEditingTarget) {
        (vm as any).setEditingTarget = originalSetEditingTarget;
      }
      if (originalEmitWorkspaceUpdate) {
        (vm as any).emitWorkspaceUpdate = originalEmitWorkspaceUpdate;
      }
    };
  }, [vm]);

  //优化：字段初始化延迟 + rAF 同步
  React.useEffect(() => {
    if (!blockly || !workspace) return;

    const BlocklyAny = blockly as any;
    const FieldLabel = BlocklyAny.FieldLabel?.prototype;
    const origFieldLabelInit = FieldLabel?.init;

    const origRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback: FrameRequestCallback): number {
      if (window.__SKIP_LAYOUT_UPDATE__) {
        callback(performance.now());
        return 0;
      }
      return origRAF.call(window, callback);
    };

    return () => {
      window.requestAnimationFrame = origRAF;
    };
  }, [blockly, workspace]);

  //拖拽镜头优化：开关控制 + 边界缓存 + 安全调用
  React.useEffect(() => {
    if (!blockly || !workspace) return;

    const isDragOptimizeEnabled = (window as any).__ENABLE_DRAG_OPTIMIZE__ === true;
    if (!isDragOptimizeEnabled) {
      return;
    }

    const BlocklyAny = blockly as any;
    const WorkspaceDragger = BlocklyAny.WorkspaceDragger?.prototype;
    const ScrollbarPair = BlocklyAny.ScrollbarPair?.prototype;
    const Scrollbar = BlocklyAny.Scrollbar?.prototype;
    const WorkspaceSvg = BlocklyAny.WorkspaceSvg?.prototype;

    if (!WorkspaceDragger || !ScrollbarPair || !WorkspaceSvg) {
      return;
    }

    const origStartDrag = WorkspaceDragger.startDrag;
    const origDrag = WorkspaceDragger.drag;
    const origEndDrag = WorkspaceDragger.endDrag;
    const origScrollbarPairSet = ScrollbarPair.set;
    const origSetHandlePosition = Scrollbar?.setHandlePosition;
    const origSetTopLevelMetrics = WorkspaceSvg.setTopLevelWorkspaceMetrics_;
    const origGetMetrics = WorkspaceSvg.getMetrics;
    const origGetBlocksBoundingBox = WorkspaceSvg.getBlocksBoundingBox;
    const origGetContentDimensions_ = WorkspaceSvg.getContentDimensions_;
    const origGetContentDimensionsExact_ = WorkspaceSvg.getContentDimensionsExact_;

    if (typeof window.__FAST_DRAG_MODE__ === 'undefined') {
      window.__FAST_DRAG_MODE__ = false;
    }

    let cachedMetrics: any = null;
    let cachedBoundingBox: any = null;

    WorkspaceDragger.startDrag = function() {
      const ws = this.workspace_;
      if (ws) {
        if (origGetMetrics) {
          cachedMetrics = origGetMetrics.call(ws);
        }
        if (origGetBlocksBoundingBox) {
          cachedBoundingBox = origGetBlocksBoundingBox.call(ws);
        }
      }
      window.__FAST_DRAG_MODE__ = true;
      workspace.getInjectionDiv()?.classList.add('gandi-fast-drag');
      if (origStartDrag) {
        return origStartDrag.call(this);
      }
    };

    WorkspaceDragger.drag = function(currentDragDeltaXY: any) {
      if (!window.__FAST_DRAG_MODE__) {
        if (origDrag) return origDrag.call(this, currentDragDeltaXY);
        return;
      }

      const ws = this.workspace_;
      const metrics = this.startDragMetrics_;
      const startScroll = this.startScrollXY_;

      const newXY = {
        x: startScroll.x + currentDragDeltaXY.x + 325,
        y: startScroll.y + currentDragDeltaXY.y
      };

      let x = Math.max(-newXY.x, metrics.contentLeft);
      let y = Math.max(-newXY.y, metrics.contentTop);
      x = Math.min(x, -metrics.viewWidth + metrics.contentLeft + metrics.contentWidth);
      y = Math.min(y, -metrics.viewHeight + metrics.contentTop + metrics.contentHeight);

      const translateX = -x - 0 * metrics.contentLeft;
      const translateY = -y - 0 * metrics.contentTop;

      ws.translate(translateX, translateY);
      if (ws.grid_) {
        ws.grid_.moveTo(translateX, translateY);
      }
    };

    WorkspaceDragger.endDrag = function(currentDragDeltaXY: any) {
      window.__FAST_DRAG_MODE__ = false;
      workspace.getInjectionDiv()?.classList.remove('gandi-fast-drag');
      cachedMetrics = null;
      cachedBoundingBox = null;

      if (origScrollbarPairSet) ScrollbarPair.set = origScrollbarPairSet;
      if (Scrollbar && origSetHandlePosition) Scrollbar.setHandlePosition = origSetHandlePosition;

      let result;
      if (origEndDrag) {
        result = origEndDrag.call(this, currentDragDeltaXY);
      }

      ScrollbarPair.set = function(x: number, y: number) {
        if (window.__FAST_DRAG_MODE__) return;
        if (origScrollbarPairSet) return origScrollbarPairSet.call(this, x, y);
      };
      if (Scrollbar && origSetHandlePosition) {
        Scrollbar.setHandlePosition = function(newPosition: number) {
          if (window.__FAST_DRAG_MODE__) {
            this.handlePosition_ = newPosition;
            return;
          }
          return origSetHandlePosition.call(this, newPosition);
        };
      }

      return result;
    };

    ScrollbarPair.set = function(x: number, y: number) {
      if (window.__FAST_DRAG_MODE__) return;
      if (origScrollbarPairSet) return origScrollbarPairSet.call(this, x, y);
    };

    if (Scrollbar && origSetHandlePosition) {
      Scrollbar.setHandlePosition = function(newPosition: number) {
        if (window.__FAST_DRAG_MODE__) {
          this.handlePosition_ = newPosition;
          return;
        }
        return origSetHandlePosition.call(this, newPosition);
      };
    }

    WorkspaceSvg.setTopLevelWorkspaceMetrics_ = function(xyRatio: any) {
      if (window.__FAST_DRAG_MODE__) return;
      if (origSetTopLevelMetrics) return origSetTopLevelMetrics.call(this, xyRatio);
    };

    WorkspaceSvg.getMetrics = function() {
      if (window.__FAST_DRAG_MODE__ && cachedMetrics) return cachedMetrics;
      if (origGetMetrics) return origGetMetrics.call(this);
    };

    WorkspaceSvg.getBlocksBoundingBox = function() {
      if (window.__FAST_DRAG_MODE__ && cachedBoundingBox) return cachedBoundingBox;
      if (origGetBlocksBoundingBox) return origGetBlocksBoundingBox.call(this);
    };

    WorkspaceSvg.getContentDimensions_ = function() {
      if (window.__FAST_DRAG_MODE__ && cachedMetrics) {
        return {
          width: cachedMetrics.contentWidth,
          height: cachedMetrics.contentHeight,
          left: cachedMetrics.contentLeft,
          top: cachedMetrics.contentTop
        };
      }
      if (origGetContentDimensions_) return origGetContentDimensions_.call(this);
    };

    WorkspaceSvg.getContentDimensionsExact_ = function() {
      if (window.__FAST_DRAG_MODE__ && cachedMetrics) {
        return {
          left: cachedMetrics.contentLeft,
          right: cachedMetrics.contentLeft + cachedMetrics.contentWidth,
          top: cachedMetrics.contentTop,
          bottom: cachedMetrics.contentTop + cachedMetrics.contentHeight
        };
      }
      if (origGetContentDimensionsExact_) return origGetContentDimensionsExact_.call(this);
    };

    return () => {
      WorkspaceDragger.startDrag = origStartDrag;
      WorkspaceDragger.drag = origDrag;
      WorkspaceDragger.endDrag = origEndDrag;
      ScrollbarPair.set = origScrollbarPairSet;
      if (Scrollbar && origSetHandlePosition) Scrollbar.setHandlePosition = origSetHandlePosition;
      WorkspaceSvg.setTopLevelWorkspaceMetrics_ = origSetTopLevelMetrics;
      WorkspaceSvg.getMetrics = origGetMetrics;
      WorkspaceSvg.getBlocksBoundingBox = origGetBlocksBoundingBox;
      WorkspaceSvg.getContentDimensions_ = origGetContentDimensions_;
      WorkspaceSvg.getContentDimensionsExact_ = origGetContentDimensionsExact_;

      workspace.getInjectionDiv()?.classList.remove('gandi-fast-drag');
      window.__FAST_DRAG_MODE__ = false;
    };
  }, [blockly, workspace]);

  //  切入优化- 延迟布局计算 
  React.useEffect(() => {
    if (!blockly || !workspace) return;

    const BlocklyAny = blockly as any;
    const WorkspaceSvg = BlocklyAny.WorkspaceSvg?.prototype ? BlocklyAny.WorkspaceSvg : workspace.constructor;

    const origUpdateScreenCalculations = WorkspaceSvg.prototype.updateScreenCalculations_;
    if (!origUpdateScreenCalculations) return;

    WorkspaceSvg.prototype.updateScreenCalculations_ = function() {
      if (window.__SKIP_LAYOUT_UPDATE__) {
        if (this.updateInverseScreenCTM) this.updateInverseScreenCTM();
        return;
      }
      return origUpdateScreenCalculations.call(this);
    };

    const WorkspaceProto = BlocklyAny.Workspace?.prototype || workspace.constructor.prototype;
    const origGetTopBlocks = WorkspaceProto.getTopBlocks;
    if (origGetTopBlocks) {
      WorkspaceProto.getTopBlocks = function(ordered?: boolean) {
        if (window.__FILTER_TOP_BLOCKS_FOR_SERIALIZATION__) {
          const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
          if (ct) {
            const activeId = getActiveGroupId(ct.id);
            if (activeId !== ALL_GROUPS_ID) {
              const allTopBlocks = origGetTopBlocks.call(this, ordered) as any[];
              return allTopBlocks.filter((block: any) => getBlockGroup(block) === activeId);
            }
          }
        }
        return origGetTopBlocks.call(this, ordered);
      };
    }

    const forceLayoutUpdate = () => {
      const ws = workspace as any;
      if (ws.updateInverseScreenCTM) ws.updateInverseScreenCTM();
      if (origUpdateScreenCalculations) origUpdateScreenCalculations.call(ws);
    };
    (window as any).__FORCE_LAYOUT_UPDATE__ = forceLayoutUpdate;

    return () => {
      WorkspaceSvg.prototype.updateScreenCalculations_ = origUpdateScreenCalculations;
      if (origGetTopBlocks) WorkspaceProto.getTopBlocks = origGetTopBlocks;
      delete (window as any).__FORCE_LAYOUT_UPDATE__;
    };
  }, [blockly, workspace]);

  //  注释处理：修复重复显示问题 
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `g.scratchCommentTopBar { display: none !important; }`;
    document.head.appendChild(style);

    let shownContainers = new WeakSet<Element>();

    const isGroupComment = (container: Element): boolean => {
      const blockSvg = container.closest('g.blocklyDraggable');
      const blockId = blockSvg?.getAttribute('data-id') || blockSvg?.id;
      if (blockId) {
        const groupId = getBlockGroup({ id: blockId });
        if (groupId !== ALL_GROUPS_ID) return true;
      }
      const textarea = container.querySelector('textarea.scratchCommentTextarea') as HTMLTextAreaElement | null;
      return textarea ? textarea.value.includes('__|EdiOpt|') : false;
    };

    const showNormalComments = () => {
      let comments: any[] = [];
      if (typeof (workspace as any).getTopComments === 'function') {
        comments = (workspace as any).getTopComments(true);
      } else if ((workspace as any).commentDB_) {
        comments = Object.values((workspace as any).commentDB_);
      } else {
        const canvas = workspace.getCanvas();
        if (!canvas) return;
        const containers = canvas.querySelectorAll('g:has(.scratchCommentTopBar)');
        containers.forEach((container: Element) => {
          if (container.closest('.blocklyContextMenu')) return;
          if (shownContainers.has(container)) return;
          if (isGroupComment(container)) {
            shownContainers.add(container);
            return;
          }
          (container as HTMLElement).style.setProperty('display', 'block', 'important');
          container.classList.add('gandi-normal-comment');
          shownContainers.add(container);
        });
        return;
      }

      comments.forEach((comment: any) => {
        const root = comment.svgGroup_ || comment.getSvgRoot?.();
        if (!root) return;
        if (root.closest?.('.blocklyContextMenu')) return;
        if (shownContainers.has(root)) return;
        if (isGroupComment(root)) {
          shownContainers.add(root);
          return;
        }
        root.style.setProperty('display', 'block', 'important');
        root.classList.add('gandi-normal-comment');
        shownContainers.add(root);
      });
    };

    const observer = new MutationObserver(() => {
      setTimeout(showNormalComments, 20);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(showNormalComments, 200);
    const interval = setInterval(showNormalComments, 500);

    return () => {
      document.head.removeChild(style);
      observer.disconnect();
      clearInterval(interval);
      const canvas = workspace.getCanvas();
      if (canvas) {
        const comments = canvas.querySelectorAll('.gandi-normal-comment');
        comments.forEach((el) => el.classList.remove('gandi-normal-comment'));
      }
    };
  }, [workspace]);

  //全屏优化
  React.useEffect(() => {
    if (!vm || !workspace) return;
    const runtime = (vm as any).runtime;
    if (!runtime) return;

    const renderer = runtime.renderer;
    if (!renderer) {
      return;
    }

    const RenderWebGLProto = Object.getPrototypeOf(renderer);
    if (!RenderWebGLProto || !RenderWebGLProto.resize) {
      return;
    }

    const origResize = RenderWebGLProto.resize;
    const injectionDiv = workspace.getInjectionDiv();

    RenderWebGLProto.resize = function(pixelsWide: number, pixelsTall: number) {
      const { canvas } = this._gl;
      if (window.__ENABLE_FULLSCREEN_OPTIMIZATION__){
        const isEnteringFullscreen = pixelsTall > canvas.height;
        const isExitingFullscreen = pixelsTall <= canvas.height;
        
        if (isEnteringFullscreen && !window.__IN_FULLSCREEN_MODE__) {
          window.__IN_FULLSCREEN_MODE__ = true;
          if (injectionDiv) { 
            (injectionDiv as any).style.display = 'none';
          }
          if ((Blockly as any).Events) {
            (Blockly as any).Events.disable();
          }
        } else if (isExitingFullscreen && window.__IN_FULLSCREEN_MODE__) {
          window.__IN_FULLSCREEN_MODE__ = false;
          if (injectionDiv) {
            (injectionDiv as any).style.display = '';
          }
          if ((Blockly as any).Events) {
            (Blockly as any).Events.enable();
          }
          workspace.recordCachedAreas?.();
          workspace.resize?.();
        }
      }

      return origResize.call(this, pixelsWide, pixelsTall);
    };

    return () => {
      RenderWebGLProto.resize = origResize;
      window.__IN_FULLSCREEN_MODE__ = false;
      if (injectionDiv) (injectionDiv as any).style.display = '';
      if ((Blockly as any).Events) (Blockly as any).Events.enable();
    };
  }, [vm, workspace]);
  
  //分组UI
  const portal = document.querySelector('.plugins-wrapper');
  if (!portal) return null;

  return (
    <>
      {ReactDOM.createPortal(
        <Tooltip className={styles.icon} icon={<GroupIcon />} onClick={handleClick} tipText="积木分组" />,
        portal
      )}
      {visible &&
        ReactDOM.createPortal(
          <ExpansionBox
            title="积木分组"
            id="block-groups"
            minWidth={280}
            minHeight={400}
            borderRadius={8}
            stayOnTop
            onClose={() => setVisible(false)}
            containerInfo={containerInfo}
          >
            <Box className={styles.container}>
              <div
                className={`${styles.listItem} ${activeGroupId === ALL_GROUPS_ID ? styles.active : ''}`}
                onClick={() => handleSelectGroup(ALL_GROUPS_ID)}
              >
                <span className={styles.itemText}>📁 全部显示</span>
                {activeGroupId === ALL_GROUPS_ID && <CheckIcon />}
              </div>
              <div className={styles.divider} />
              <div className={styles.groupList}>
                {groups.map(g => (
                  <div key={g.id} className={`${styles.listItem} ${activeGroupId === g.id ? styles.active : ''}`}>
                    <div className={styles.groupName} onClick={() => handleSelectGroup(g.id)}>
                      {editingGroupId === g.id ? (
                        <Input
                          value={editingName}
                          onChange={(e: any) => setEditingName(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e: any) => e.key === 'Enter' && saveEdit()}
                          autoFocus
                          size="sm"
                          onClick={(e: any) => e.stopPropagation()}
                        />
                      ) : (
                        <span className={styles.groupNameText} onDoubleClick={() => startEdit(g.id, g.name)}>
                          {g.name}
                        </span>
                      )}
                      {activeGroupId === g.id && <CheckIcon />}
                    </div>
                    <IconButton size="sm" onClick={() => handleDeleteGroup(g.id)} disabled={g.id === UNGROUPED_ID}>
                      <DeleteIcon />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className={styles.addGroup}>
                <Input
                  placeholder="新分组名称"
                  value={newGroupName}
                  onChange={(e: any) => setNewGroupName(e.target.value)}
                  size="sm"
                />
                <button className={styles.addButton} onClick={handleAddGroup}>
                  <AddIcon />新建
                </button>
              </div>
            </Box>
          </ExpansionBox>,
          document.body
        )}
    </>
  );
};


EditorOptimization.displayName = "EditorOptimization";
export default EditorOptimization;