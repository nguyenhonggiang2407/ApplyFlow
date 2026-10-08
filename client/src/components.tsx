import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  X,
  ArrowUpRight,
  MapPin,
  CalendarDays,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Pencil,
  Clock3,
  ArrowRight,
} from 'lucide-react';
import {
  MODE_LABELS,
  STATUS_LABELS,
  STATUSES,
  WORK_MODES,
  type Application,
  type ApplicationInput,
  type Status,
  type Task,
} from '../../shared/types';
import { dateLabel, dueLabel, daysUntil, initials } from './utils';
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null),
    busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const panel = ref.current!;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      );
    (focusable()[0] ?? panel).focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = '';
      queueMicrotask(() => {
        // A replacement modal owns focus; restore only after the last modal closes.
        if (document.querySelector('.modal-panel[aria-modal="true"]')) return;
        if (
          previous?.isConnected &&
          previous !== document.body &&
          previous !== document.documentElement
        ) {
          previous.focus({ preventScroll: true });
          if (document.activeElement === previous) return;
        }
        document.getElementById('main-content')?.focus({ preventScroll: true });
      });
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="modal-panel"
      >
        <header className="modal-header">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <i />
      {STATUS_LABELS[status]}
    </span>
  );
}
export function CompanyMark({ company }: { company: string }) {
  const code = Array.from(company).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return (
    <span aria-hidden="true" className={`company-mark mark-${code}`}>
      {initials(company)}
    </span>
  );
}
export function ApplicationCard({
  item,
  onOpen,
}: {
  item: Application;
  onOpen: (item: Application) => void;
}) {
  return (
    <button className="application-card" onClick={() => onOpen(item)}>
      <div className="card-company">
        <CompanyMark company={item.company} />
        <span>{item.company}</span>
        <ArrowUpRight size={17} />
      </div>
      <h3>{item.role}</h3>
      <div className="card-meta">
        <span>
          <MapPin size={13} />
          {item.location || 'Chưa đặt địa điểm'}
        </span>
        <span>{MODE_LABELS[item.workMode]}</span>
      </div>
      <footer>
        {item.deadline ? (
          <span
            className={daysUntil(item.deadline) < 0 && item.status === 'saved' ? 'overdue' : ''}
          >
            <CalendarDays size={13} />
            {dueLabel(item.deadline)}
          </span>
        ) : (
          <span>Không có hạn ứng tuyển</span>
        )}
        <span className="card-open">
          Xem hồ sơ <ArrowRight size={12} />
        </span>
      </footer>
    </button>
  );
}
const blank: ApplicationInput = {
  company: '',
  role: '',
  location: '',
  workMode: 'hybrid',
  status: 'saved',
  url: '',
  deadline: '',
  appliedOn: '',
  notes: '',
};
export function ApplicationForm({
  item,
  onSave,
  onClose,
  busy,
}: {
  item: Application | null;
  onSave: (value: ApplicationInput) => Promise<boolean>;
  onClose: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState<ApplicationInput>(
    item
      ? {
          company: item.company,
          role: item.role,
          location: item.location,
          workMode: item.workMode,
          status: item.status,
          url: item.url,
          deadline: item.deadline,
          appliedOn: item.appliedOn,
          notes: item.notes,
        }
      : blank,
  );
  const [error, setError] = useState('');
  const set = (field: keyof ApplicationInput, next: string) =>
    setValue((current) => ({ ...current, [field]: next }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!value.company.trim() || !value.role.trim()) {
      setError('Điền tên công ty và vị trí ứng tuyển.');
      return;
    }
    if (value.url) {
      try {
        const url = new URL(value.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw Error();
      } catch {
        setError('Liên kết cần bắt đầu bằng http:// hoặc https://.');
        return;
      }
    }
    await onSave(value);
  };
  return (
    <Modal
      title={item?.id ? 'Chỉnh sửa hồ sơ' : 'Một cơ hội mới'}
      subtitle="Lưu những thông tin cần thiết để chuẩn bị bước tiếp theo."
      onClose={onClose}
      busy={busy}
    >
      <form className="application-form" onSubmit={submit}>
        <fieldset className="form-section" disabled={busy}>
          <legend>
            <span>01</span> Thông tin cơ hội
          </legend>
          <p>Công ty và vị trí giúp bạn tìm lại hồ sơ nhanh hơn.</p>
          <div className="form-grid">
            <label>
              Công ty <span>*</span>
              <input
                autoComplete="organization"
                required
                maxLength={120}
                value={value.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Ví dụ: Nori Studio"
              />
            </label>
            <label>
              Vị trí ứng tuyển <span>*</span>
              <input
                required
                maxLength={160}
                value={value.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Frontend Developer Intern"
              />
            </label>
            <label>
              Địa điểm
              <input
                maxLength={100}
                value={value.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="TP. Hồ Chí Minh"
              />
            </label>
            <label>
              Hình thức
              <select value={value.workMode} onChange={(e) => set('workMode', e.target.value)}>
                {WORK_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section" disabled={busy}>
          <legend>
            <span>02</span> Theo dõi tiến độ
          </legend>
          <p>Ghi lại bước hiện tại và những mốc thời gian cần nhớ.</p>
          <div className="form-grid">
            <label>
              Trạng thái
              <select value={value.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ngày gửi hồ sơ
              <input
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={value.appliedOn}
                onChange={(e) => set('appliedOn', e.target.value)}
              />
            </label>
            <label>
              Hạn ứng tuyển
              <input
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={value.deadline}
                onChange={(e) => set('deadline', e.target.value)}
              />
            </label>
            <label>
              Liên kết tuyển dụng
              <input
                type="url"
                maxLength={2000}
                value={value.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section" disabled={busy}>
          <legend>
            <span>03</span> Chuẩn bị của bạn
          </legend>
          <label>
            Ghi chú
            <textarea
              maxLength={5000}
              rows={4}
              value={value.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Điều bạn cần chuẩn bị, yêu cầu kỹ năng, câu hỏi cho buổi phỏng vấn…"
            />
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <span>
            <span className="required-marker">*</span> Thông tin bắt buộc
          </span>
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Đang lưu…' : item?.id ? 'Lưu thay đổi' : 'Thêm hồ sơ'}
            <Plus size={17} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function TaskItem({
  task,
  application,
  onToggle,
  onOpen,
  busy,
  onDelete,
}: {
  task: Task;
  application?: Application;
  onToggle: (task: Task) => void;
  onOpen?: (item: Application) => void;
  busy: boolean;
  onDelete?: (task: Task) => void;
}) {
  return (
    <div className={`task-row ${task.completed ? 'task-completed' : ''}`}>
      <button
        className="task-check"
        aria-label={
          task.completed ? `Đánh dấu chưa hoàn thành: ${task.title}` : `Hoàn thành: ${task.title}`
        }
        aria-pressed={task.completed}
        onClick={() => onToggle(task)}
        disabled={busy}
      >
        {task.completed && <Check size={14} />}
      </button>
      <div className="task-copy">
        <span>{task.title}</span>
        {application && (
          <button className="task-company" onClick={() => onOpen?.(application)}>
            {application.company} · {application.role}
          </button>
        )}
      </div>
      <span
        className={`task-due ${task.dueDate && daysUntil(task.dueDate) < 0 && !task.completed ? 'overdue' : ''}`}
      >
        <Clock3 size={13} />
        {dueLabel(task.dueDate)}
      </span>
      {onDelete && (
        <button
          className="icon-button small"
          aria-label={`Xóa việc: ${task.title}`}
          onClick={() => onDelete(task)}
          disabled={busy}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
export function ApplicationDetail({
  item,
  tasks,
  onClose,
  onEdit,
  onStatus,
  onDelete,
  onTask,
  onToggle,
  onTaskDelete,
  busy,
}: {
  item: Application;
  tasks: Task[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: (status: Status) => void;
  onDelete: () => void;
  onTask: (title: string, dueDate: string) => Promise<boolean>;
  onToggle: (task: Task) => void;
  onTaskDelete: (task: Task) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(''),
    [date, setDate] = useState(''),
    [confirm, setConfirm] = useState(false);
  const completed = tasks.filter((task) => task.completed).length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onTask(title, date)) {
      setTitle('');
      setDate('');
    }
  };
  return (
    <Modal title={item.role} subtitle={item.company} onClose={onClose} busy={busy}>
      <div className="detail-body">
        <div className="detail-top">
          <CompanyMark company={item.company} />
          <div>
            <strong>{item.company}</strong>
            <p>
              <MapPin size={14} />
              {item.location || 'Chưa đặt địa điểm'} · {MODE_LABELS[item.workMode]}
            </p>
          </div>
          <button className="button secondary compact" onClick={onEdit} disabled={busy}>
            <Pencil size={15} />
            Sửa
          </button>
        </div>
        <div className="detail-stage">
          <label htmlFor="detail-status">Bước hiện tại</label>
          <select
            id="detail-status"
            value={item.status}
            onChange={(e) => onStatus(e.target.value as Status)}
            disabled={busy}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <StatusBadge status={item.status} />
        </div>
        <div className="detail-dates">
          <div>
            <span>
              <CalendarDays size={16} /> Hạn ứng tuyển
            </span>
            <strong>{dateLabel(item.deadline)}</strong>
            {item.deadline && item.status === 'saved' && (
              <small className={daysUntil(item.deadline) < 0 ? 'overdue' : ''}>
                {dueLabel(item.deadline)}
              </small>
            )}
          </div>
          <div>
            <span>
              <Check size={16} /> Đã gửi hồ sơ
            </span>
            <strong>{dateLabel(item.appliedOn)}</strong>
          </div>
        </div>
        {item.url && (
          <a className="detail-link" href={item.url} target="_blank" rel="noopener noreferrer">
            Mở thông tin tuyển dụng
            <ExternalLink size={15} />
          </a>
        )}
        <section className="notes-section">
          <h3>Ghi chú của bạn</h3>
          <p className={item.notes ? '' : 'muted'}>
            {item.notes || 'Chưa có ghi chú. Thêm điều bạn muốn chuẩn bị cho cơ hội này.'}
          </p>
        </section>
        <section className="detail-tasks">
          <div className="section-heading">
            <h3>Việc cần chuẩn bị</h3>
            <span>
              {completed}/{tasks.length} hoàn thành
            </span>
          </div>
          {tasks.length > 0 && (
            <progress
              className="task-progress"
              value={completed}
              max={tasks.length}
              aria-label="Tiến độ việc chuẩn bị"
            />
          )}
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onTaskDelete}
              busy={busy}
            />
          ))}
          {!tasks.length && (
            <p className="muted">Chia việc chuẩn bị thành các bước nhỏ, có hạn cụ thể.</p>
          )}
          <form className="task-form" onSubmit={submit}>
            <label className="task-title-label" htmlFor="task-title">
              Việc cần làm
              <input
                id="task-title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Thêm một việc cần làm…"
                disabled={busy}
              />
            </label>
            <label className="task-date-label" htmlFor="task-date">
              Hạn hoàn thành
              <input
                id="task-date"
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
              />
            </label>
            <button
              className="button primary compact"
              disabled={busy || !title.trim()}
              aria-label="Thêm việc"
            >
              <Plus size={18} />
            </button>
          </form>
        </section>
        <footer className="detail-footer">
          {confirm ? (
            <div className="delete-confirm">
              <p>Xóa hồ sơ và các việc liên quan? Thao tác này không thể hoàn tác.</p>
              <button
                className="button secondary compact"
                onClick={() => setConfirm(false)}
                disabled={busy}
              >
                Giữ lại
              </button>
              <button className="button danger compact" onClick={onDelete} disabled={busy}>
                Xóa hồ sơ
              </button>
            </div>
          ) : (
            <>
              <span>Thêm ngày {dateLabel(item.createdAt.slice(0, 10))}</span>
              <button
                className="text-button danger-text"
                onClick={() => setConfirm(true)}
                disabled={busy}
              >
                <Trash2 size={14} />
                Xóa hồ sơ
              </button>
            </>
          )}
        </footer>
      </div>
    </Modal>
  );
}
