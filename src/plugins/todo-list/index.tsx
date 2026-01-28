import * as React from "react";
import * as ReactDOM from "react-dom";
import ExpansionBox, { ExpansionRect } from "components/ExpansionBox";
import Tooltip from "components/Tooltip";
import useStorageInfo from "hooks/useStorageInfo";
import TodoListIcon from "assets/icon--todo-list.svg";
import FinishIcon from "assets/icon--finish.svg";
import styles from "./styles.less";
import { Todo } from "./types";
import ScratchConfigStorage from "./configHelper";

// 自动刷新间隔（毫秒）
const AUTO_REFRESH_INTERVAL = 3000;

const DEFAULT_CONTAINER_INFO = {
  width: 300,
  height: 450,
  translateX: 72,
  translateY: 60,
};

const TodoList: React.FC<PluginContext> = ({ msg, registerSettings, vm }) => {
  const [visible, setVisible] = React.useState(false);
  const [containerInfo, setContainerInfo] = useStorageInfo("TODO_LIST_CONTAINER_INFO", DEFAULT_CONTAINER_INFO);
  const [todoList, setTodoList] = React.useState<Todo[]>([]);
  const [isAdding, setIsAdding] = React.useState(false); // 是否正在添加新项
  const [newItemValue, setNewItemValue] = React.useState(""); // 新项输入值
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editingValue, setEditingValue] = React.useState("");

  const rootRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const containerInfoRef = React.useRef(containerInfo);
  const newItemInputRef = React.useRef<HTMLInputElement>(null);
  const editInputRef = React.useRef<HTMLInputElement>(null);

  const dataRef = React.useRef(new ScratchConfigStorage(vm.runtime, "TODO_LIST", "Todo List"));

  // 获取 Todo 列表
  const getTodoList = React.useCallback((): Todo[] => {
    return (dataRef.current.getItem("todolist") as Todo[]) || [];
  }, []);

  // 刷新列表状态
  const refreshTodoList = React.useCallback(() => {
    setTodoList(getTodoList());
  }, [getTodoList]);

  // 创建 Todo
  const createTodo = React.useCallback(
    (content: string) => {
      if (!content.trim()) return false;
      const _list = getTodoList();
      const newTodo: Todo = { id: Date.now(), content: content.trim() };
      dataRef.current.setItem("todolist", [..._list, newTodo]);
      refreshTodoList();
      return true;
    },
    [getTodoList, refreshTodoList],
  );

  // 删除 Todo
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

  // 重命名 Todo
  const renameTodo = React.useCallback(
    (id: number, newContent: string) => {
      if (!newContent.trim()) return;
      const _list = getTodoList();
      dataRef.current.setItem(
        "todolist",
        _list.map((item) => (item.id === id ? { ...item, content: newContent.trim() } : item)),
      );
      refreshTodoList();
    },
    [getTodoList, refreshTodoList],
  );

  // 容器位置计算
  const getContainerPosition = React.useCallback(() => {
    const { x, y } = rootRef.current.getBoundingClientRect();
    return {
      translateX: x - containerInfoRef.current.width - 10,
      translateY: y - 6,
    };
  }, []);

  // 显示面板
  const handleShow = React.useCallback(() => {
    setContainerInfo({
      ...containerInfoRef.current,
      ...getContainerPosition(),
    });
    refreshTodoList();
    setVisible(true);
  }, [getContainerPosition, refreshTodoList, setContainerInfo]);

  // 关闭面板
  const handleClose = React.useCallback(() => {
    setVisible(false);
    setEditingId(null);
  }, []);

  // 尺寸变化
  const handleSizeChange = React.useCallback(
    (value: ExpansionRect) => {
      containerInfoRef.current = value;
      setContainerInfo(value);
    },
    [setContainerInfo],
  );

  // 点击"+"按钮，开始添加新项
  const handleStartAdding = React.useCallback(() => {
    setIsAdding(true);
    setNewItemValue("");
  }, []);

  // 保存新项
  const handleSaveNewItem = React.useCallback(() => {
    if (newItemValue.trim()) {
      createTodo(newItemValue);
    }
    setIsAdding(false);
    setNewItemValue("");
  }, [newItemValue, createTodo]);

  // 新项输入框键盘事件
  const handleNewItemKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSaveNewItem();
      } else if (e.key === "Escape") {
        setIsAdding(false);
        setNewItemValue("");
      }
    },
    [handleSaveNewItem],
  );

  // 开始编辑
  const handleStartEdit = React.useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditingValue(todo.content);
  }, []);

  // 完成编辑
  const handleFinishEdit = React.useCallback(() => {
    if (editingId !== null && editingValue.trim()) {
      renameTodo(editingId, editingValue);
    }
    setEditingId(null);
    setEditingValue("");
  }, [editingId, editingValue, renameTodo]);

  // 编辑框键盘事件
  const handleEditKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleFinishEdit();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setEditingValue("");
      }
    },
    [handleFinishEdit],
  );

  // 编辑框聚焦
  React.useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // 新项输入框聚焦
  React.useEffect(() => {
    if (isAdding && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [isAdding]);

  // 自动刷新（当面板可见时）
  React.useEffect(() => {
    if (!visible) return;

    const intervalId = setInterval(() => {
      refreshTodoList();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [visible, refreshTodoList]);

  // 注册设置
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

  // 渲染 Todo 项
  const renderTodoItem = React.useCallback(
    (todo: Todo) => {
      const isEditing = editingId === todo.id;

      return (
        <div className={styles.todoItem} key={todo.id}>
          {isEditing ? (
            <input
              ref={editInputRef}
              className={styles.todoContentEditing}
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={handleEditKeyDown}
            />
          ) : (
            <span className={styles.todoContent} onClick={() => handleStartEdit(todo)}>
              {todo.content}
            </span>
          )}
          <button className={styles.todoDelete} onClick={() => deleteTodo(todo.id)}>
            <FinishIcon />
          </button>
        </div>
      );
    },
    [editingId, editingValue, handleFinishEdit, handleEditKeyDown, handleStartEdit, deleteTodo],
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
              {/* Todo 列表 */}
              <div className={styles.todoList}>
                {todoList.length > 0 ? todoList.map(renderTodoItem) : <></>}
                {/* 添加新项按钮/输入框 */}
                {isAdding ? (
                  <div className={styles.todoItem}>
                    <input
                      ref={newItemInputRef}
                      className={styles.todoContentEditing}
                      type="text"
                      placeholder={msg("plugins.todoList.placeholder")}
                      value={newItemValue}
                      onChange={(e) => setNewItemValue(e.target.value)}
                      onBlur={handleSaveNewItem}
                      onKeyDown={handleNewItemKeyDown}
                    />
                  </div>
                ) : (
                  <button className={styles.addItemButton} onClick={handleStartAdding}>
                    +
                  </button>
                )}
              </div>
              {/* 刷新按钮 - 右下角 */}
              <button
                className={styles.refreshButton}
                onClick={refreshTodoList}
                title={msg("plugins.todoList.refresh")}
              >
                ↻
              </button>
            </div>
          </ExpansionBox>,
          document.body,
        )}
    </section>,
    document.querySelector(".plugins-wrapper"),
  );
};

TodoList.displayName = "TodoList";

export default TodoList;
