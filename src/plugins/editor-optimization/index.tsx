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

  const handleSelectGroup = (groupId: string) => {
    if (!targetId) return;
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
          description: '提供角色积木分组功能，同时优化编辑器性能。',
          items: [
            {
              key: 'enableFastClear',
              type: 'switch',
              label: '[实验]启用切出优化',
              description: '极大优化切出大型角色时的效率。',
              value: false,
              onChange: (v: boolean) => {
                window.__EDITOR_OPT_FAST_CLEAR_ENABLED__ = v;
                console.log(`[快速清理] 开关: ${v}`);
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
                console.log(`[切入优化] 开关: ${v}`);
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
                console.log(`[拖拽优化] 开关: ${v}`);
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
                console.log(`[全屏优化] 开关: ${v}`);
              }
            }
          ]
        }
      ],
      <GroupIcon />
    );
    return () => dispose.dispose();
  }, [registerSettings]);

  //分组劫持
  React.useEffect(() => {
    if (!blockly || !workspace || !vm) return;

    const origClear = blockly.Xml?.clearWorkspaceAndLoadFromXml;
    const origDom = blockly.Xml?.domToBlock;
    const origClearWs = blockly.Xml?.clearWorkspace;

    if (!origClear || !origDom) return;

    blockly.Xml.clearWorkspaceAndLoadFromXml = function(xml: any, ...args: any[]) {
      const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
      if (!ct) return origClear.call(this, xml, ...args);
      const targetId = ct.id;
      const activeId = getActiveGroupId(targetId);
      const tw = workspace || this;

      let xmlString = typeof xml === 'string' ? xml : new XMLSerializer().serializeToString(xml);
      const doc = new DOMParser().parseFromString(xmlString, "text/xml");
      const root = doc.documentElement;
      if (!root) return origClear.call(this, xml, ...args);

      // 恢复分组信息
      Array.from(root.children)
        .filter(c => c.tagName.toLowerCase() === 'block')
        .forEach(n => restoreBlockGroupFromXml(n as Element, targetId));

      //切入优化-延迟布局
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
      // 额外清理所有注释，防止残留
if (typeof tw.getTopComments === 'function') {
  const comments = tw.getTopComments(true);
  comments.forEach((comment: any) => {
    if (comment.dispose) {
      comment.dispose();
    }
  });
} else if ((tw as any).commentDB_) {
  Object.values((tw as any).commentDB_).forEach((comment: any) => {
    if (comment.dispose) {
      comment.dispose();
    }
  });
}
// 如果仍然有 DOM 残留，强制移除画布中所有带注释类名的元素
const canvas = tw.getCanvas();
if (canvas) {
  const commentElements = canvas.querySelectorAll('.scratchCommentTopBar, .blocklyComment');
  commentElements.forEach((el: Element) => el.remove());
} 
      const scheduleLayoutReset = () => {
      if (!shouldOptimize) return;
      setTimeout(() => {
        const startFinal = performance.now();

        // 先恢复标志，让后续 render 正常工作
        window.__SKIP_LAYOUT_UPDATE__ = false;

        // 强制所有积木重新渲染以修复字段显示
        const allBlocks = tw.getAllBlocks(false) as any[];
        for (const block of allBlocks) {
          if (block.rendered) {
            try {
              block.render(false);
            } catch (e) {}
          }
        }

        // 全局布局更新
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
        if (activeId === ALL_GROUPS_ID) {
          const result = origClear.call(this, xml, ...args);
          scheduleLayoutReset();
          return result;
        } else {
          // 使用劫持后的 workspace.clear() 以应用快速清理优化
          if (tw.clear) {
            tw.clear();
          } else {
            if (origClearWs) origClearWs.call(blockly.Xml, tw);
            else tw.getAllBlocks?.().forEach((b: any) => b.dispose?.());
          }

          const topBlocks = extractTopLevelBlocks(xmlString);
          topBlocks.forEach(node => {
            const bid = node.getAttribute('id');
            if (!bid) return;
            if (getBlockGroup({ id: bid }) === activeId) {
              try {
                const b = origDom.call(blockly.Xml, node.cloneNode(true), tw);
                if (b) {
                  b.moveBy(parseFloat(node.getAttribute('x') || '0'), parseFloat(node.getAttribute('y') || '0'));
                }
              } catch { }
            }
          });
          tw.scrollCenter?.();
          scheduleLayoutReset();
          return tw;
        }
      } catch (e) {
        if (shouldOptimize) {
          window.__SKIP_LAYOUT_UPDATE__ = false;
          const injectionDiv = workspace.getInjectionDiv();
          if (injectionDiv) {
            injectionDiv.classList.remove('gandi-fastload-animation');
            injectionDiv.classList.remove('gandi-fastload-contain');
          }
        }
        throw e;
      } finally {
        setTimeout(() => refreshGroups(), 20);
      }
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
                    // 隐藏该积木及其所有子积木
                    const hideBlockStack = (block: any) => {
                      if (!block) return;
                      // 隐藏自身
                      if (block.getSvgRoot) {
                        const rootSvg = block.getSvgRoot();
                        if (rootSvg) rootSvg.style.display = 'none';
                      }
                      // 隐藏连接线（可选，Blockly 会自动隐藏？通常跟随积木隐藏即可）
                      // 递归隐藏子积木
                      const children = block.getChildren(false);
                      children.forEach((child: any) => hideBlockStack(child));
                    };
                    
                    hideBlockStack(root);
                  }
                  toast.success(`已移至「${g.name}」`);
                } catch (e) {
                  console.error('移动分组失败', e);
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

  //切出优化-快速清理
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

    //劫持 removeClass，在节点为 null 时静默忽略
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

    // 劫持 Connection.dispose（快速清理时跳过数据库操作）
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

    // 劫持 Field.dispose
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

    // 劫持 Input.dispose
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

      const startRemoveDOM = performance.now();
      while (canvas.firstChild) {
        canvas.removeChild(canvas.firstChild);
      }
      const removeDOMTime = performance.now() - startRemoveDOM;

      // 快速清理模式：直接重置内部数据结构
      const startReset = performance.now();
      window.__FAST_CLEAR_MODE__ = true;
      try {
        if (BlocklyAny.Events) BlocklyAny.Events.disable();
        try {
          // 重置积木映射表
          workspaceSvg.blockDB_ = Object.create(null);
          // 重置顶层积木列表
          workspaceSvg.topBlocks_ = [];
          // 重置注释数据库（如果有）
          if (workspaceSvg.commentDB_) {
            workspaceSvg.commentDB_ = Object.create(null);
          }
          // 重置连接数据库列表
          const dbList = workspaceSvg.connectionDBList;
          if (dbList) {
            for (let i = 0; i < dbList.length; i++) {
              if (dbList[i]) {
                dbList[i].connections_ = [];
              }
            }
          }
          // 注意：不重置 variableMap_
        } finally {
          if (BlocklyAny.Events) BlocklyAny.Events.enable();
        }
      } finally {
        window.__FAST_CLEAR_MODE__ = false;
      }
      const resetTime = performance.now() - startReset;
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

  // 劫持 requestAnimationFrame，在快速模式下同步执行
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

//拖拽镜头优化：开关控制 + 边界缓存 + 安全调用 ，不过没啥性能提升。
React.useEffect(() => {
  if (!blockly || !workspace) return;

  // 检查全局开关是否启用（由设置面板控制）
  const isDragOptimizeEnabled = (window as any).__ENABLE_DRAG_OPTIMIZE__ === true;
  if (!isDragOptimizeEnabled) {
    console.log('[拖拽优化] 开关未启用，跳过劫持');
    return;
  }

  const BlocklyAny = blockly as any;
  const WorkspaceDragger = BlocklyAny.WorkspaceDragger?.prototype;
  const ScrollbarPair = BlocklyAny.ScrollbarPair?.prototype;
  const Scrollbar = BlocklyAny.Scrollbar?.prototype;
  const WorkspaceSvg = BlocklyAny.WorkspaceSvg?.prototype;

  if (!WorkspaceDragger || !ScrollbarPair || !WorkspaceSvg) {
    console.warn('[拖拽优化] 缺少必要原型，跳过');
    return;
  }

  // 保存所有原始方法
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

  // 初始化全局快速模式标志
  if (typeof window.__FAST_DRAG_MODE__ === 'undefined') {
    window.__FAST_DRAG_MODE__ = false;
  }

  let cachedMetrics: any = null;
  let cachedBoundingBox: any = null;

  // startDrag 劫持
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

  //  drag 劫持
  WorkspaceDragger.drag = function(currentDragDeltaXY: any) {
    if (!window.__FAST_DRAG_MODE__) {
      if (origDrag) return origDrag.call(this, currentDragDeltaXY);
      return;
    }

    const ws = this.workspace_;
    const metrics = this.startDragMetrics_;
    const startScroll = this.startScrollXY_;

    // 模仿原方法写法。
    const newXY = {
      x: startScroll.x + currentDragDeltaXY.x + 325, //这个数字并不源于任何计算，只是单纯我试出来的能够让积木偏移回去的常数。
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

  //  endDrag 
  WorkspaceDragger.endDrag = function(currentDragDeltaXY: any) {
    window.__FAST_DRAG_MODE__ = false;
    workspace.getInjectionDiv()?.classList.remove('gandi-fast-drag');
    cachedMetrics = null;
    cachedBoundingBox = null;

    // 临时恢复滚动条原始方法
    if (origScrollbarPairSet) ScrollbarPair.set = origScrollbarPairSet;
    if (Scrollbar && origSetHandlePosition) Scrollbar.setHandlePosition = origSetHandlePosition;

    let result;
    if (origEndDrag) {
      result = origEndDrag.call(this, currentDragDeltaXY);
    }

    // 重新劫持
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

  //  劫持滚动条与布局 
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

  //  边界缓存 
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

  console.log('[拖拽优化] 已安装');

  //  清理 
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
    console.log('[拖拽优化] 劫持已恢复');
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

    // 劫持 getTopBlocks 用于序列化过滤
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

  let shownContainers = new WeakSet<Element>(); // 每次切换角色时重新创建

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
  // 尝试通过 Blockly 工作区 API 获取所有注释（Scratch 专用）
  let comments: any[] = [];
  if (typeof (workspace as any).getTopComments === 'function') {
    comments = (workspace as any).getTopComments(true);
  } else if ((workspace as any).commentDB_) {
    comments = Object.values((workspace as any).commentDB_);
  } else {
    // 降级：安全地通过画布查询，但严格限定在画布内
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

  // 通过工作区实例处理每个注释
  comments.forEach((comment: any) => {
    // 注释的根 SVG 元素通常是 comment.svgGroup_ 或 comment.getSvgRoot()
    const root = comment.svgGroup_ || comment.getSvgRoot?.();
    if (!root) return;

    // 跳过右键菜单内的元素
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

  // 监听目标切换和积木变化，重新显示注释
  const observer = new MutationObserver(() => {
    setTimeout(showNormalComments, 20);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 初始化显示
  setTimeout(showNormalComments, 200);
  const interval = setInterval(showNormalComments, 500);

  return () => {
    document.head.removeChild(style);
    observer.disconnect();
    clearInterval(interval);
    // 清理添加的类
    const canvas = workspace.getCanvas();
    if (canvas) {
      const comments = canvas.querySelectorAll('.gandi-normal-comment');
      comments.forEach((el) => el.classList.remove('gandi-normal-comment'));
    }
  };
}, [workspace]); // 依赖 workspace，确保切换角色时重新执行整个 useEffect
//全屏优化
React.useEffect(() => {
  if (!vm || !workspace) return;
  const runtime = (vm as any).runtime;
  if (!runtime) return;

  const renderer = runtime.renderer;
  if (!renderer) {
    console.warn('[全屏优化] 未找到 renderer，跳过');
    return;
  }

  const RenderWebGLProto = Object.getPrototypeOf(renderer);
  if (!RenderWebGLProto || !RenderWebGLProto.resize) {
    console.warn('[全屏优化] 无法获取 RenderWebGLProto.resize，跳过');
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

      // 视觉隐藏：直接将整个积木区容器设为不可见
      if (injectionDiv) { 
        (injectionDiv as any).style.display = 'none';
      }

      // 禁用事件和某些观察器（可选）
      if ((Blockly as any).Events) {
        (Blockly as any).Events.disable();  // 阻止积木区事件触发
      }
    } else if (isExitingFullscreen && window.__IN_FULLSCREEN_MODE__) {
      window.__IN_FULLSCREEN_MODE__ = false;

      // 恢复显示
      if (injectionDiv) {
        (injectionDiv as any).style.display = '';
      }

      if ((Blockly as any).Events) {
        (Blockly as any).Events.enable();
      }

      // 强制刷新工作区布局（因为隐藏期间可能错过了尺寸变化）
      workspace.recordCachedAreas?.();
      workspace.resize?.();
    }
  }

    return origResize.call(this, pixelsWide, pixelsTall);
  };

  console.log('[全屏优化] 已安装（视觉隐藏模式）');

  return () => {
    RenderWebGLProto.resize = origResize;
    window.__IN_FULLSCREEN_MODE__ = false;
    if (injectionDiv) (injectionDiv as any).style.display = '';
    if ((Blockly as any).Events) (Blockly as any).Events.enable();
    console.log('[全屏优化] 已卸载');
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