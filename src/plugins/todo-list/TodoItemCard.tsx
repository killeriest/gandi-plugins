import * as React from "react";
import FinishIcon from "assets/icon--finish.svg";
import { Todo } from "./types";
import styles from "./styles/index.less";

interface TodoItemCardProps {
  todo: Todo;
  assigneeAvatars: React.ReactNode[];
  reminderState: {
    overdue: boolean;
    soon: boolean;
  };
  onEdit: (todo: Todo) => void;
  onToggleStatus: (todo: Todo) => void;
  onDelete: (id: number) => void;
}

const TodoItemCard: React.FC<TodoItemCardProps> = ({ todo, assigneeAvatars, reminderState, onEdit, onToggleStatus, onDelete }) => {
  const timeLabel = todo.startTime || todo.endTime ? `${todo.startTime || ""}${todo.startTime && todo.endTime ? " ~ " : ""}${todo.endTime || ""}` : "";

  return (
    <div className={styles.todoCard} onClick={() => onEdit(todo)}>
      <div className={styles.todoCardHeader}>
        <span className={`${styles.todoCardPriority} ${styles[`todoCardPriority${todo.priority}` as keyof typeof styles]}`}>{todo.priority}</span>
        <span className={styles.todoCardTitle}>{todo.title}</span>
        <span
          className={`${styles.todoCardStatus} ${
            todo.status === "completed" ? styles.todoCardStatusCompleted : styles.todoCardStatusPending
          }`}
        >
          {todo.status === "completed" ? "完成" : "进行"}
        </span>
      </div>

      {todo.content && <div className={styles.todoCardContent}>{todo.content}</div>}

      {timeLabel && (
        <div className={styles.todoCardTime}>
          <span className={styles.todoCardTimeIcon}>⏱</span>
          <span>{timeLabel}</span>
          {reminderState.overdue && <span className={styles.todoCardReminderOverdue}>已到期</span>}
          {reminderState.soon && <span className={styles.todoCardReminderSoon}>即将到期</span>}
        </div>
      )}

      <div className={styles.todoCardFooter}>
        <button
          className={styles.todoCardDeleteButton}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <FinishIcon />
        </button>
        <div className={styles.todoCardMembers}>{assigneeAvatars}</div>
        {todo.watcherIds.length > 0 && <span className={styles.todoCardWatcherCount}>关注 {todo.watcherIds.length}</span>}

        <div className={styles.todoCardActions} onClick={(event) => event.stopPropagation()}>
          <button className={styles.todoCardFinishButton} onClick={() => onToggleStatus(todo)}>
            {todo.status === "completed" ? "撤销" : "完成"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TodoItemCard;
