import * as React from "react";
import { Todo, TodoPriority } from "./types";
import MemberMultiPicker from "./MemberMultiPicker";
import styles from "./styles/index.less";

interface TodoDetailModalProps {
  visible: boolean;
  detailTodoId: number | null;
  detailDraft: Todo;
  priorityOptions: TodoPriority[];
  teamworkMembers: readonly TeamMember[] | null;
  detailTitleRef: React.RefObject<HTMLInputElement>;
  memberPickerOpen: "assignee" | "watcher" | null;
  setMemberPickerOpen: React.Dispatch<React.SetStateAction<"assignee" | "watcher" | null>>;
  onChangeDraft: React.Dispatch<React.SetStateAction<Todo>>;
  onClose: () => void;
  onSave: () => void;
  onToggleStatus: (todo: Todo) => void;
}

const TITLE_ERROR_TIMEOUT = 3000;

const TodoDetailModal: React.FC<TodoDetailModalProps> = ({
  visible,
  detailTodoId,
  detailDraft,
  priorityOptions,
  teamworkMembers,
  detailTitleRef,
  memberPickerOpen,
  setMemberPickerOpen,
  onChangeDraft,
  onClose,
  onSave,
  onToggleStatus,
}) => {
  const [titleError, setTitleError] = React.useState(false);
  const titleErrorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTitleError = React.useCallback(() => {
    setTitleError(false);
    if (titleErrorTimerRef.current) {
      clearTimeout(titleErrorTimerRef.current);
      titleErrorTimerRef.current = null;
    }
  }, []);

  const handleSave = React.useCallback(() => {
    const title = detailDraft.title.trim() || detailDraft.content.trim();
    if (!title) {
      setTitleError(true);
      detailTitleRef.current?.focus();
      titleErrorTimerRef.current = setTimeout(clearTitleError, TITLE_ERROR_TIMEOUT);
      return;
    }
    onSave();
  }, [detailDraft.title, detailDraft.content, detailTitleRef, clearTitleError, onSave]);

  const handleTitleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (titleError) clearTitleError();
      onChangeDraft((prev) => ({ ...prev, title: event.target.value }));
    },
    [titleError, clearTitleError, onChangeDraft],
  );

  React.useEffect(() => {
    return () => {
      if (titleErrorTimerRef.current) clearTimeout(titleErrorTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.todoDetail}>
      <div className={styles.todoDetailModal}>
        <div className={styles.todoDetailHeader}>
          <span className={styles.todoDetailTitle}>{detailTodoId ? "任务详情" : "创建待办"}</span>
          <button className={styles.todoDetailClose} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.todoDetailBody}>
          <div className={styles.todoDetailPriorityRow}>
            {priorityOptions.map((priority) => (
              <button
                key={priority}
                className={`${styles.todoDetailPriorityOption} ${
                  detailDraft.priority === priority
                    ? styles[`todoDetailPriorityOption${priority}Active` as keyof typeof styles] ||
                      styles.todoDetailPriorityOptionActive
                    : ""
                }`}
                onClick={() => onChangeDraft((prev) => ({ ...prev, priority }))}
              >
                {priority}
              </button>
            ))}
          </div>

          <input
            ref={detailTitleRef}
            className={`${styles.todoDetailInput}${titleError ? ` ${styles.todoDetailInputError}` : ""}`}
            placeholder="标题（必填）"
            value={detailDraft.title}
            onChange={handleTitleChange}
          />

          <textarea
            className={styles.todoDetailTextarea}
            placeholder="具体事项"
            value={detailDraft.content}
            onChange={(event) => onChangeDraft((prev) => ({ ...prev, content: event.target.value }))}
          />

          <div className={styles.todoDetailTimeRow}>
            <label className={styles.todoDetailTimeField}>
              <span className={styles.todoDetailTimeLabel}>开始时间</span>
              <input
                type="datetime-local"
                className={styles.todoDetailTimeInput}
                value={detailDraft.startTime || ""}
                onChange={(event) => onChangeDraft((prev) => ({ ...prev, startTime: event.target.value }))}
              />
            </label>
            <label className={styles.todoDetailTimeField}>
              <span className={styles.todoDetailTimeLabel}>结束时间</span>
              <input
                type="datetime-local"
                className={styles.todoDetailTimeInput}
                value={detailDraft.endTime || ""}
                onChange={(event) => onChangeDraft((prev) => ({ ...prev, endTime: event.target.value }))}
              />
            </label>
          </div>

          {teamworkMembers && teamworkMembers.length > 0 && (
            <div className={styles.todoDetailMemberSection}>
              <MemberMultiPicker
                label="执行者"
                placeholder="选择执行人"
                selectedIds={detailDraft.assigneeIds}
                onChange={(nextIds) => onChangeDraft((prev) => ({ ...prev, assigneeIds: nextIds }))}
                members={teamworkMembers}
                isOpen={memberPickerOpen === "assignee"}
                onToggle={() => setMemberPickerOpen((prev) => (prev === "assignee" ? null : "assignee"))}
                onClose={() => setMemberPickerOpen(null)}
              />

              <MemberMultiPicker
                label="关注者"
                placeholder="选择关注人"
                selectedIds={detailDraft.watcherIds}
                onChange={(nextIds) => onChangeDraft((prev) => ({ ...prev, watcherIds: nextIds }))}
                members={teamworkMembers}
                isOpen={memberPickerOpen === "watcher"}
                onToggle={() => setMemberPickerOpen((prev) => (prev === "watcher" ? null : "watcher"))}
                onClose={() => setMemberPickerOpen(null)}
              />
            </div>
          )}
        </div>

        <div className={styles.todoDetailFooter}>
          <button className={styles.todoDetailPrimary} onClick={handleSave}>
            {detailTodoId ? "保存" : "创建待办"}
          </button>
          {detailTodoId && (
            <button className={styles.todoDetailSecondary} onClick={() => onToggleStatus(detailDraft)}>
              {detailDraft.status === "completed" ? "标记未完成" : "标记完成"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoDetailModal;
