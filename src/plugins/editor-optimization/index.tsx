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

// 内联图标组件
const AddIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>);
const DeleteIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>);
const CheckIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>);
const GroupIcon = () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>);

const DEFAULT_CONTAINER_INFO = { width: 280, height: 400, translateX: 72, translateY: 60 };

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

  // 初始化全局 VM
  React.useEffect(() => { setGlobalVM(vm); }, [vm]);
  React.useEffect(() => { loadFromLocalStorage(); }, []);

  const refreshGroups = React.useCallback(() => {
    if (!targetId) return;
    setGroups(getGroups(targetId));
    setActiveGroupIdState(getActiveGroupId(targetId));
  }, [targetId]);

  // 监听当前编辑目标的变化
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

  // ========== 劫持 Blockly 加载逻辑 ==========
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

      // 恢复分组信息（从 comment）
      Array.from(root.children)
        .filter(c => c.tagName.toLowerCase() === 'block')
        .forEach(n => restoreBlockGroupFromXml(n as Element, targetId));
      
      setTimeout(() => refreshGroups(), 20);

      if (activeId === ALL_GROUPS_ID) {
        return origClear.call(this, xml, ...args);
      }

      if (origClearWs) origClearWs.call(blockly.Xml, tw);
      else tw.getAllBlocks?.().forEach((b: any) => b.dispose?.());

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
      return tw;
    };

    const handleCreate = (e: any) => {
      if (e.type !== blockly.Events.BLOCK_CREATE) return;
      const block = workspace.getBlockById(e.blockId) as any; // 断言为 any 避免 TS 报错
      if (!block || block.getParent?.()) return;
      const ct = (vm as any).editingTarget || (vm as any).runtime?._editingTarget;
      if (!ct) return;
      const activeId = getActiveGroupId(ct.id);
      setBlockGroup(block, activeId === ALL_GROUPS_ID ? UNGROUPED_ID : activeId, ct.id);
    };
    workspace.addChangeListener(handleCreate);

      // 右键菜单
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
            
            // 添加分隔线
            items.push({ separator: true });
            
            // 平铺所有分组
            allGroups.forEach(g => {
              items.push({
                text: `移动到「${g.name}」${g.id === cur ? ' ✓' : ''}`,
                enabled: g.id !== cur,
                callback: () => {
                  try {
                    setBlockGroup(root, g.id, targetId);
                    if (getActiveGroupId(targetId) !== ALL_GROUPS_ID && getActiveGroupId(targetId) !== g.id) {
                      (vm as any).emitWorkspaceUpdate?.();
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

// ========== 注释处理：全局隐藏 + 精准恢复普通注释 ==========
// ========== 注释处理：全局隐藏容器 + 精准显示普通注释容器 ==========
React.useEffect(() => {
  // 1. 注入 CSS：默认隐藏所有注释容器（整个气泡）
  const style = document.createElement('style');
  style.textContent = `
    /* 隐藏所有注释的根容器 */
    g:has(.scratchCommentTopBar) {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  const shownContainers = new Set<Element>();

  // 2. 判断是否为分组注释
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

  // 3. 显示普通注释容器（移除内联隐藏样式）
  const showNormalComments = () => {
    const containers = document.querySelectorAll('g:has(.scratchCommentTopBar)');
    containers.forEach((container: Element) => {
      if (shownContainers.has(container)) return;

      if (isGroupComment(container)) {
        shownContainers.add(container);
        return;
      }

      // 普通注释：强制显示容器
      (container as HTMLElement).style.setProperty('display', 'block', 'important');
      // 可选：添加淡入动画
      container.classList.add('gandi-normal-comment');
      shownContainers.add(container);
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
    shownContainers.clear();
  };
}, []);
  // 注册设置项
  React.useEffect(() => {
    if (!registerSettings) return;
    const d = registerSettings(
      '积木分组',
      'plugin-editor-optimization',
      [{ key: 'group', label: '分组', description: '管理积木分组', items: [] }],
      <GroupIcon />
    );
    return () => d.dispose();
  }, [registerSettings]);

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