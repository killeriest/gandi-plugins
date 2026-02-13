import * as React from "react";
import * as ReactDOM from "react-dom";
import ExpansionBox, { ExpansionRect } from "components/ExpansionBox";
import Tooltip from "components/Tooltip";
import Tab from "components/Tab";
import useStorageInfo from "hooks/useStorageInfo";
import TodoListIcon from "assets/icon--todo-list.svg";
import TodoItemCard from "./TodoItemCard";
import TodoDetailModal from "./TodoDetailModal";
import styles from "./styles/index.less";
import { RuntimeFixed, Todo, TodoPriority, TodoStatus } from "./types";
import ScratchConfigStorage from "./configHelper";

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
    assigneeIds:
      todo.assigneeIds && todo.assigneeIds.length > 0 ? todo.assigneeIds : legacyPicOid ? [legacyPicOid] : [],
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

  const rootRef = React.useRef<HTMLElement>(null);
  const containerRef = React.useRef<any>(null);
  const containerInfoRef = React.useRef(containerInfo);
  const detailTitleRef = React.useRef<HTMLInputElement>(null);

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

      const list = getTodoList();
      const newTodo: Todo = {
        ...draft,
        id: Date.now(),
        title: title.trim(),
        content: draft.content.trim(),
      };

      dataRef.current.setItem("todolist", [...list, newTodo]);
      refreshTodoList();
      return true;
    },
    [getTodoList, refreshTodoList],
  );

  const updateTodo = React.useCallback(
    (id: number, partial: Partial<Todo>) => {
      const list = getTodoList();
      dataRef.current.setItem(
        "todolist",
        list.map((item) => (item.id === id ? { ...item, ...partial } : item)),
      );
      refreshTodoList();
    },
    [getTodoList, refreshTodoList],
  );

  const deleteTodo = React.useCallback(
    (id: number) => {
      const list = getTodoList();
      dataRef.current.setItem(
        "todolist",
        list.filter((item) => item.id !== id),
      );
      refreshTodoList();
    },
    [getTodoList, refreshTodoList],
  );

  const toggleTodoStatus = React.useCallback(
    (todo: Todo) => {
      updateTodo(todo.id, {
        status: todo.status === "completed" ? "pending" : "completed",
      });
    },
    [updateTodo],
  );

  const getContainerPosition = React.useCallback(() => {
    const { x, y } = (rootRef.current as HTMLElement).getBoundingClientRect();
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
    if (!title) return;

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
  const filteredTodos = todoList.filter((todo) =>
    activeStatusFilter === "all" ? true : todo.status === activeStatusFilter,
  );

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
          className={styles.todoCardMemberAvatar}
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

  return ReactDOM.createPortal(
    <section className={styles.todoPlugin} ref={rootRef}>
      <Tooltip
        className={styles.todoPluginIcon}
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
            <div className={styles.todoPluginPanelBody}>
              <Tab
                className={styles.todoPluginTabs}
                items={STATUS_TABS.map((tab) => tab.label)}
                activeIndex={statusTabIndex}
                onChange={handleStatusTabChange}
              />

              <div className={styles.todoPluginList}>
                {filteredTodos.length > 0 ? (
                  filteredTodos.map((todo) => (
                    <TodoItemCard
                      key={todo.id}
                      todo={todo}
                      reminderState={computeReminderState(todo)}
                      assigneeAvatars={todo.assigneeIds
                        .slice(0, 3)
                        .map((memberId, index) => renderMemberAvatar(memberId, index))
                        .filter(Boolean)}
                      onEdit={openEditDetail}
                      onToggleStatus={toggleTodoStatus}
                      onDelete={deleteTodo}
                    />
                  ))
                ) : (
                  <></>
                )}
                <button className={styles.todoPluginAddButton} onClick={openCreateDetail}>
                  + 添加待办
                </button>
              </div>

              <button
                className={styles.todoPluginRefreshButton}
                onClick={refreshTodoList}
                title={msg("plugins.todoList.refresh")}
              >
                ↻
              </button>
            </div>
          </ExpansionBox>,
          document.body,
        )}

      {detailVisible &&
        ReactDOM.createPortal(
          <TodoDetailModal
            visible={detailVisible}
            detailTodoId={detailTodoId}
            detailDraft={detailDraft}
            priorityOptions={PRIORITY_OPTIONS}
            teamworkMembers={teamworkMembers}
            detailTitleRef={detailTitleRef}
            memberPickerOpen={memberPickerOpen}
            setMemberPickerOpen={setMemberPickerOpen}
            onChangeDraft={setDetailDraft}
            onClose={closeDetail}
            onSave={handleSaveDetail}
            onToggleStatus={toggleTodoStatus}
          />,
          document.body,
        )}
    </section>,
    document.querySelector(".plugins-wrapper") as HTMLElement,
  );
};

TodoList.displayName = "TodoList";

export default TodoList;
