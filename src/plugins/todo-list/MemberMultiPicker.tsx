import * as React from "react";
import * as ReactDOM from "react-dom";
import styles from "./styles/index.less";

interface MemberMultiPickerProps {
  label: string;
  placeholder: string;
  msg: (id: string) => string;
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  members: readonly TeamMember[] | null;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const MemberMultiPicker: React.FC<MemberMultiPickerProps> = ({
  label,
  placeholder,
  msg,
  selectedIds,
  onChange,
  members,
  isOpen,
  onToggle,
  onClose,
}) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});

  const toggleMember = React.useCallback(
    (memberId: string) => {
      const next = selectedIds.includes(memberId)
        ? selectedIds.filter((id) => id !== memberId)
        : [...selectedIds, memberId];
      onChange(next);
    },
    [onChange, selectedIds],
  );

  React.useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 10001,
      });
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div>
      <button ref={buttonRef} className={styles.todoDetailMemberPickerButton} onClick={onToggle} type="button">
        <span className={styles.todoDetailMemberPickerLabel}>{label}</span>
        <span className={styles.todoDetailMemberPickerValue}>
          {selectedIds.length > 0 ? msg("plugins.todoList.memberPicker.selectedCount").replace("{count}", String(selectedIds.length)) : placeholder}
        </span>
        <span className={styles.todoDetailMemberPickerArrow}>▾</span>
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div ref={dropdownRef} className={styles.todoDetailMemberPickerDropdown} style={dropdownStyle}>
            <div className={styles.todoDetailMemberPickerDropdownHeader}>{label}</div>
            <div className={styles.todoDetailMemberPickerList}>
              {members?.map((member) => {
                const selected = selectedIds.includes(member.id);
                return (
                  <div
                    key={member.id}
                    className={`${styles.todoDetailMemberPickerItem} ${selected ? styles.todoDetailMemberPickerItemSelected : ""}`}
                    onClick={() => toggleMember(member.id)}
                  >
                    <img className={styles.todoDetailMemberPickerAvatar} src={member.avatar} alt={member.name} />
                    <span className={styles.todoDetailMemberPickerName}>{member.name}</span>
                    {selected && <span className={styles.todoDetailMemberPickerCheck}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default MemberMultiPicker;
