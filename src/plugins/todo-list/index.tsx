import * as React from "react";
import * as ReactDOM from "react-dom";
import ExpansionBox, { ExpansionRect } from "components/ExpansionBox";
import Tooltip from "components/Tooltip";
import Tab from "components/Tab";
import useStorageInfo from "hooks/useStorageInfo";
import TodoListIcon from "assets/icon--todo-list.svg";
import FinishIcon from "assets/icon--finish.svg";
import styles from "./styles.less";
import { RuntimeFixed, Todo, TodoPriority, TodoStatus } from "./types";
import ScratchConfigStorage from "./configHelper";
import PersonIcon from "assets/icon--person.svg";

// 自动刷新间隔（毫秒）
const AUTO_REFRESH_INTERVAL = 3000;
const REMINDER_REFRESH_INTERVAL = 60000;
const PRIORITY_OPTIONS: TodoPriority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];
const STATUS_TABS: Array<{ label: string; value: "all" | TodoStatus }> = [
  { label: "全部完成", value: "all" },
  { label: "待完成", value: "pending" },
  { label: "已完成", value: "completed" },
];
const REMINDER_SOON_MS = 60 * 60 * 1000;

const DEFAULT_CONTAINER_INFO = {
  width: 300,
  height: 450,
  translateX: 72,
  translateY: 60,
};

const createEmptyTodoDraft = (): Todo => ({
  id: Date.now(),
  title: "",
  content: "",
  priority: "P3",
  startTime: undefined,
  endTime: undefined,
  assigneeIds: [],
  watcherIds: [],
  status: "pending",
});

const normalizeTodo = (todo: Partial<Todo> & { id: number }): Todo => {
  const content = todo.content || "";
  const legacyPicOid = (todo as any).picOid as string | undefined;
  return {
    id: todo.id,
    title: todo.title || content || "未命名",
    content,
    priority: todo.priority || "P3",
    startTime: todo.startTime,
    endTime: todo.endTime,
    assigneeIds: todo.assigneeIds && todo.assigneeIds.length > 0 ? todo.assigneeIds : legacyPicOid ? [legacyPicOid] : [],
    watcherIds: todo.watcherIds || [],
    status: todo.status || "pending",
  };
};

const TodoList: React.FC<PluginContext> = ({ msg, registerSettings, vm, teamworkManager }) => {
  const [visible, setVisible] = React.useState(false);
  const [containerInfo, setContainerInfo] = useStorageInfo("TODO_LIST_CONTAINER_INFO", DEFAULT_CONTAINER_INFO);
  const [todoList, setTodoList] = React.useState<Todo[]>([]);
  const [statusTabIndex, setStatusTabIndex] = React.useState(0);
  const [detailVisible, setDetailVisible] = React.useState(false);
  const [detailTodoId, setDetailTodoId] = React.useState<number | null>(null);
  const [detailDraft, setDetailDraft] = React.useState<Todo>(createEmptyTodoDraft());
  const [teamworkMembers, setTeamworkMembers] = React.useState<readonly TeamMember[] | null>([]);
  const [memberPickerOpen, setMemberPickerOpen] = React.useState<"assignee" | "watcher" | null>(null);
  const [reminderTick, setReminderTick] = React.useState(Date.now());

  const rootRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const containerInfoRef = React.useRef(containerInfo);
  const detailTitleRef = React.useRef<HTMLInputElement>(null);
  const memberPickerRef = React.useRef<HTMLDivElement>(null);

  const dataRef = React.useRef(new ScratchConfigStorage(vm.runtime as RuntimeFixed, "TODO_LIST", "Todo List"));

  const getTodoList = React.useCallback((): Todo[] => {
    const rawList = (dataRef.current.getItem("todolist") as Array<Partial<Todo>>) || [];
    const normalizedList = rawList.map((item) => normalizeTodo(item as Todo));
    const shouldPersist = rawList.some((item, index) => {
      const normalized = normalizedList[index];
      return (
        (item as Todo).title !== normalized.title ||
        (item as Todo).priority !== normalized.priority ||
        (item as Todo).status !== normalized.status ||
        JSON.stringify((item as Todo).assigneeIds || []) !== JSON.stringify(normalized.assigneeIds) ||
        JSON.stringify((item as Todo).watcherIds || []) !== JSON.stringify(normalized.watcherIds)
      );
    });
    if (shouldPersist) {
      dataRef.current.setItem("todolist", normalizedList);
    }
    return normalizedList;
  }, []);

  const refreshTodoList = React.useCallback(() => {
    setTodoList(getTodoList());
  }, [getTodoList]);

  const createTodo = React.useCallback(
    (draft: Todo) => {
      const title = draft.title.trim() || draft.content.trim();
      if (!title) return false;
      const _list = getTodoList();
      const newTodo: Todo = {
        ...draft,
        id: Date.now(),
        title: title.trim(),
        content: draft.content.trim(),
      };
      dataRef.current.setItem("todolist", [..._list, newTodo]);
      refreshTodoList();
      return true;
    },
    [getTodoList, refreshTodoList],
  );

  const updateTodo = React.useCallback(
    (id: number, partial: Partial<Todo>) => {
      const _list = getTodoList();
      dataRef.current.setItem(
        "todolist",
        _list.map((item) => (item.id === id ? { ...item, ...partial } : item)),
      );
      refreshTodoList();
    },
    [getTodoList, refreshTodoList],
  );

  const deleteTodo = React.useCallback(
    (id: number) => {
      const _list = getTodoList();
      dataRef.current.setItem(
        "todolist",
        _list.filter((item) => item.id !== id),
      );
      refreshTodoList();
    },
    [getTodoList, refreshTodoList],
  );

  const toggleTodoStatus = React.useCallback(
    (todo: Todo) => {
      updateTodo(todo.id, { status: todo.status === "completed" ? "pending" : "completed" });
    },
    [updateTodo],
  );

  const getContainerPosition = React.useCallback(() => {
    const { x, y } = (rootRef.current as any).getBoundingClientRect();
    return {
      translateX: x - containerInfoRef.current.width - 10,
      translateY: y - 6,
    };
  }, []);

  const handleShow = React.useCallback(() => {
    setContainerInfo({
      ...containerInfoRef.current,
      ...getContainerPosition(),
    });
    refreshTodoList();
    setVisible(true);
  }, [getContainerPosition, refreshTodoList, setContainerInfo]);

  const handleClose = React.useCallback(() => {
    setVisible(false);
  }, []);

  const handleSizeChange = React.useCallback(
    (value: ExpansionRect) => {
      containerInfoRef.current = value;
      setContainerInfo(value);
    },
    [setContainerInfo],
  );

  const openCreateDetail = React.useCallback(() => {
    setDetailTodoId(null);
    setDetailDraft(createEmptyTodoDraft());
    setDetailVisible(true);
  }, []);

  const openEditDetail = React.useCallback((todo: Todo) => {
    setDetailTodoId(todo.id);
    setDetailDraft({ ...todo });
    setDetailVisible(true);
  }, []);

  const closeDetail = React.useCallback(() => {
    setDetailVisible(false);
    setMemberPickerOpen(null);
  }, []);

  const handleSaveDetail = React.useCallback(() => {
    const title = detailDraft.title.trim() || detailDraft.content.trim();
    if (!title) {
      return;
    }
    if (detailTodoId === null) {
      createTodo({ ...detailDraft, title });
    } else {
      updateTodo(detailTodoId, { ...detailDraft, title });
    }
    closeDetail();
  }, [closeDetail, createTodo, detailDraft, detailTodoId, updateTodo]);

  const handleStatusTabChange = React.useCallback((index: number) => {
    setStatusTabIndex(index);
  }, []);

  const activeStatusFilter = STATUS_TABS[statusTabIndex]?.value || "all";
  const filteredTodos = todoList.filter((todo) => (activeStatusFilter === "all" ? true : todo.status === activeStatusFilter));

  const getMemberById = React.useCallback(
    (id: string) => teamworkMembers?.find((member) => member.id === id),
    [teamworkMembers],
  );

  const renderMemberAvatar = React.useCallback(
    (memberId: string, index: number) => {
      const member = getMemberById(memberId);
      if (!member) return null;
      return (
        <img
          key={`${memberId}-${index}`}
          className={styles.memberAvatar}
          src={member.avatar}
          alt={member.name}
          title={member.name}
        />
      );
    },
    [getMemberById],
  );

  const computeReminderState = React.useCallback(
    (todo: Todo) => {
      if (!todo.endTime || todo.status === "completed") {
        return { overdue: false, soon: false };
      }
      const end = new Date(todo.endTime).getTime();
      if (Number.isNaN(end)) return { overdue: false, soon: false };
      if (end < reminderTick) return { overdue: true, soon: false };
      if (end - reminderTick <= REMINDER_SOON_MS) return { overdue: false, soon: true };
      return { overdue: false, soon: false };
    },
    [reminderTick],
  );

  React.useEffect(() => {
    if (!visible) return;

    const intervalId = setInterval(() => {
      refreshTodoList();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [visible, refreshTodoList]);

  React.useEffect(() => {
    if (!visible) return;
    const intervalId = setInterval(() => {
      setReminderTick(Date.now());
    }, REMINDER_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [visible]);

  React.useEffect(() => {
    registerSettings(
      msg("plugins.todoList.title"),
      "plugin-todo-list",
      [
        {
          key: "plugin-todo-list",
          label: msg("plugins.todoList.title"),
          description: msg("plugins.todoList.description"),
          items: [],
        },
      ],
      "",
    );
    return () => {};
  }, [msg, registerSettings]);

  React.useEffect(() => {
    if (teamworkManager) {
      setTeamworkMembers(teamworkManager.teamMembers);
    }
  }, [teamworkManager, teamworkManager?.teamMembers]);

  React.useEffect(() => {
    if (detailVisible && detailTitleRef.current) {
      detailTitleRef.current.focus();
    }
  }, [detailVisible]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (memberPickerRef.current && !memberPickerRef.current.contains(e.target as Node)) {
        setMemberPickerOpen(null);
      }
    };
    if (memberPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [memberPickerOpen]);

  const renderTodoItem = React.useCallback(
    (todo: Todo) => {
      const reminderState = computeReminderState(todo);
      const timeLabel = todo.startTime || todo.endTime ? `${todo.startTime || ""}${todo.startTime && todo.endTime ? " ~ " : ""}${todo.endTime || ""}` : "";

      return (
        <div className={styles.todoCard} key={todo.id} onClick={() => openEditDetail(todo)}>
          <div className={styles.todoCardHeader}>
            <span className={`${styles.priorityBadge} ${styles[`priority-${todo.priority.toLowerCase()}`]}`}>{todo.priority}</span>
            <span className={styles.todoTitle}>{todo.title}</span>
            <span className={`${styles.statusBadge} ${todo.status === "completed" ? styles.statusCompleted : styles.statusPending}`}>
              {todo.status === "completed" ? "完成" : "进行"}
            </span>
          </div>
          {todo.content && <div className={styles.todoContentPreview}>{todo.content}</div>}
          {timeLabel && (
            <div className={styles.todoTime}>
              <span className={styles.todoTimeIcon}>⏱</span>
              <span>{timeLabel}</span>
              {reminderState.overdue && <span className={styles.reminderOverdue}>已到期</span>}
              {reminderState.soon && <span className={styles.reminderSoon}>即将到期</span>}
            </div>
          )}
          <div className={styles.todoCardFooter}>
            <div className={styles.todoMembers}>{todo.assigneeIds.slice(0, 3).map(renderMemberAvatar)}</div>
            {todo.watcherIds.length > 0 && <span className={styles.watcherCount}>关注 {todo.watcherIds.length}</span>}
            <div className={styles.todoActions} onClick={(event) => event.stopPropagation()}>
              <button className={styles.todoFinishButton} onClick={() => toggleTodoStatus(todo)}>
                {todo.status === "completed" ? "撤销" : "完成"}
              </button>
              <button className={styles.todoDelete} onClick={() => deleteTodo(todo.id)}>
                <FinishIcon />
              </button>
            </div>
          </div>
        </div>
      );
    },
    [computeReminderState, deleteTodo, openEditDetail, renderMemberAvatar, toggleTodoStatus],
  );

  const MemberMultiPicker: React.FC<{
    label: string;
    placeholder: string;
    selectedIds: string[];
    onChange: (nextIds: string[]) => void;
    pickerKey: "assignee" | "watcher";
  }> = React.useCallback(
    ({ label, placeholder, selectedIds, onChange, pickerKey }) => {
      const toggleMember = (memberId: string) => {
        const next = selectedIds.includes(memberId)
          ? selectedIds.filter((id) => id !== memberId)
          : [...selectedIds, memberId];
        onChange(next);
      };

      return (
        <div className={styles.memberPicker} ref={memberPickerOpen === pickerKey ? memberPickerRef : undefined}>
          <button
            className={styles.memberPickerButton}
            onClick={() => setMemberPickerOpen(memberPickerOpen === pickerKey ? null : pickerKey)}
            type="button"
          >
            <span className={styles.memberPickerLabel}>{label}</span>
            <span className={styles.memberPickerValue}>
              {selectedIds.length > 0 ? `已选择 ${selectedIds.length} 人` : placeholder}
            </span>
            <span className={styles.memberPickerArrow}>▾</span>
          </button>
          {memberPickerOpen === pickerKey && (
            <div className={styles.memberPickerDropdown}>
              <div className={styles.memberPickerDropdownHeader}>{label}</div>
              <div className={styles.memberPickerList}>
                {teamworkMembers?.map((member) => {
                  const selected = selectedIds.includes(member.id);
                  return (
                    <div
                      key={member.id}
                      className={`${styles.memberPickerItem} ${selected ? styles.memberPickerItemSelected : ""}`}
                      onClick={() => toggleMember(member.id)}
                    >
                      <img className={styles.memberPickerAvatar} src={member.avatar} alt={member.name} />
                      <span className={styles.memberPickerName}>{member.name}</span>
                      {selected && <span className={styles.memberPickerCheck}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    },
    [memberPickerOpen, teamworkMembers],
  );

  return ReactDOM.createPortal(
    <section className={styles.container} ref={rootRef}>
      <Tooltip
        className={styles.icon}
        icon={<TodoListIcon />}
        onClick={handleShow}
        tipText={msg("plugins.todoList.title")}
      />
      {visible &&
        ReactDOM.createPortal(
          <ExpansionBox
            ref={containerRef}
            stayOnTop
            title={msg("plugins.todoList.title")}
            id="plugin-todo-list"
            minWidth={300}
            minHeight={450}
            borderRadius={8}
            onClose={handleClose}
            onSizeChange={handleSizeChange}
            containerInfo={containerInfo}
          >
            <div className={styles.containerBody}>
              <Tab className={styles.todoTabs} items={STATUS_TABS.map((tab) => tab.label)} activeIndex={statusTabIndex} onChange={handleStatusTabChange} />
              <div className={styles.todoList}>
                {filteredTodos.length > 0 ? filteredTodos.map(renderTodoItem) : <div className={styles.emptyState}>暂无任务</div>}
              </div>
              <button className={styles.addTaskButton} onClick={openCreateDetail}>
                + 添加待办
              </button>
              <button className={styles.refreshButton} onClick={refreshTodoList} title={msg("plugins.todoList.refresh")}>
                ↻
              </button>
            </div>
          </ExpansionBox>,
          document.body,
        )}
      {detailVisible &&
        ReactDOM.createPortal(
          <div className={styles.detailOverlay}>
            <div className={styles.detailModal}>
              <div className={styles.detailHeader}>
                <span className={styles.detailTitle}>{detailTodoId ? "任务详情" : "创建待办"}</span>
                <button className={styles.detailClose} onClick={closeDetail}>
                  ×
                </button>
              </div>
              <div className={styles.detailBody}>
                <div className={styles.priorityRow}>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <button
                      key={priority}
                      className={`${styles.priorityOption} ${detailDraft.priority === priority ? styles.priorityOptionActive : ""}`}
                      onClick={() => setDetailDraft((prev) => ({ ...prev, priority }))}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
                <input
                  ref={detailTitleRef}
                  className={styles.detailInput}
                  placeholder="大体说明"
                  value={detailDraft.title}
                  onChange={(event) => setDetailDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
                <textarea
                  className={styles.detailTextarea}
                  placeholder="具体事项"
                  value={detailDraft.content}
                  onChange={(event) => setDetailDraft((prev) => ({ ...prev, content: event.target.value }))}
                />
                <div className={styles.timeRow}>
                  <label className={styles.timeField}>
                    <span className={styles.timeLabel}>开始时间</span>
                    <input
                      type="datetime-local"
                      className={styles.timeInput}
                      value={detailDraft.startTime || ""}
                      onChange={(event) => setDetailDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </label>
                  <label className={styles.timeField}>
                    <span className={styles.timeLabel}>结束时间</span>
                    <input
                      type="datetime-local"
                      className={styles.timeInput}
                      value={detailDraft.endTime || ""}
                      onChange={(event) => setDetailDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </label>
                </div>
                {teamworkMembers && teamworkMembers.length > 0 && (
                  <div className={styles.memberSection}>
                    <MemberMultiPicker
                      label="执行者"
                      placeholder="选择执行人"
                      selectedIds={detailDraft.assigneeIds}
                      onChange={(nextIds) => setDetailDraft((prev) => ({ ...prev, assigneeIds: nextIds }))}
                      pickerKey="assignee"
                    />
                    <MemberMultiPicker
                      label="关注者"
                      placeholder="选择关注人"
                      selectedIds={detailDraft.watcherIds}
                      onChange={(nextIds) => setDetailDraft((prev) => ({ ...prev, watcherIds: nextIds }))}
                      pickerKey="watcher"
                    />
                  </div>
                )}
              </div>
              <div className={styles.detailFooter}>
                <button className={styles.detailPrimary} onClick={handleSaveDetail}>
                  {detailTodoId ? "保存" : "创建待办"}
                </button>
                {detailTodoId && (
                  <button className={styles.detailSecondary} onClick={() => toggleTodoStatus(detailDraft)}>
                    {detailDraft.status === "completed" ? "标记未完成" : "标记完成"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>,
    document.querySelector(".plugins-wrapper") as HTMLElement,
  );
};

TodoList.displayName = "TodoList";

export default TodoList;
