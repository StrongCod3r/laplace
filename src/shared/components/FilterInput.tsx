import { useRef } from 'preact/hooks';
import { Icon } from './Icon';
import styles from './FilterInput.module.css';

interface FilterInputProps {
  value: string;
  onValueChange(value: string): void;
  label: string;
  placeholder: string;
  title?: string;
  invalid?: boolean;
  describedBy?: string;
  graphSearch?: boolean;
}

export function FilterInput({
  value,
  onValueChange,
  label,
  placeholder,
  title,
  invalid,
  describedBy,
  graphSearch,
}: FilterInputProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.field}>
      <input
        ref={input}
        type="search"
        value={value}
        onInput={(event) => onValueChange(event.currentTarget.value)}
        aria-label={label}
        placeholder={placeholder}
        title={title}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        data-graph-search={graphSearch || undefined}
        autoComplete="off"
        spellcheck={false}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          title="Clear filter"
          onClick={() => {
            onValueChange('');
            input.current?.focus();
          }}
        >
          <Icon name="x" size="14" />
        </button>
      )}
    </div>
  );
}
