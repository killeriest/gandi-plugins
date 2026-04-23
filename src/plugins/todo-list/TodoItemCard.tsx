import * as React from "react";
import FinishIcon from "assets/icon--finish.svg";
import { Todo } from "./types";
import styles from "./styles/index.less";

interface TodoItemCardProps {
  todo: Todo;
  msg: (id: string) => string;
  assigneeAvatars: React.ReactNode[];
  reminderState: {
    overdue: boolean;
    soon: boolean;
  };
  onEdit: (todo: Todo) => void;
  onToggleStatus: (todo: Todo) => void;
  onDelete: (id: number) => void;
}

const TodoItemCard: React.FC<TodoItemCardProps> = ({ todo, msg, assigneeAvatars, reminderState, onEdit, onToggleStatus, onDelete }) => {
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
          {todo.status === "completed" ? msg("plugins.todoList.card.completed") : msg("plugins.todoList.card.inProgress")}
        </span>
      </div>

      {todo.content && <div className={styles.todoCardContent}>{todo.content}</div>}

      {timeLabel && (
        <div className={styles.todoCardTime}>
          <span className={styles.todoCardTimeIcon}>⏱</span>
          <span>{timeLabel}</span>
          {reminderState.overdue && <span className={styles.todoCardReminderOverdue}>{msg("plugins.todoList.card.overdue")}</span>}
          {reminderState.soon && <span className={styles.todoCardReminderSoon}>{msg("plugins.todoList.card.dueSoon")}</span>}
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
        {todo.watcherIds.length > 0 && <span className={styles.todoCardWatcherCount}>{msg("plugins.todoList.card.watchers")} {todo.watcherIds.length}</span>}

        <div className={styles.todoCardActions} onClick={(event) => event.stopPropagation()}>
          <button className={styles.todoCardFinishButton} onClick={() => onToggleStatus(todo)}>
            {todo.status === "completed" ? msg("plugins.todoList.card.undo") : msg("plugins.todoList.card.complete")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TodoItemCard;
