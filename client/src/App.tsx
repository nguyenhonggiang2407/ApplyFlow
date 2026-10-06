import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  X,
  Columns3,
  List,
  Inbox,
} from 'lucide-react';
import {
  STATUS_LABELS,
  STATUSES,
  MODE_LABELS,
  type SessionResponse,
  type Workspace,
  type Application,
  type ApplicationInput,
  type Status,
  type Task,
} from '../../shared/types';
import { api, ApiError, setCsrf } from './api';
import {
  ApplicationCard,
  ApplicationDetail,
  ApplicationForm,
  CompanyMark,
  StatusBadge,
  TaskItem,
} from './components';
import { dateLabel, daysUntil, exportApplications, initials, today } from './utils';
const empty: Workspace = { applications: [], tasks: [], activities: [] };
type View = 'overview' | 'applications' | 'tasks';
const viewFromHash = (): View =>
  ['applications', 'tasks'].includes(location.hash.slice(1))
    ? (location.hash.slice(1) as View)
    : 'overview';
let bootstrap: Promise<SessionResponse> | undefined;
export function App() {
  const [session, setSession] = useState<SessionResponse | null>(null),
    [workspace, setWorkspace] = useState<Workspace>(empty),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [view, setView] = useState<View>(viewFromHash),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<Status | 'all'>('all'),
    [board, setBoard] = useState(true),
    [taskFilter, setTaskFilter] = useState<'pending' | 'all' | 'done'>('pending');
  const [selected, setSelected] = useState<number | null>(null),
    [editing, setEditing] = useState<Application | null | undefined>(undefined),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [mobileNav, setMobileNav] = useState(false);
  const epoch = useRef(0);
  const refresh = useCallback(async () => {
    const current = epoch.current;
    const data = await api<Workspace>('/workspace');
    if (current === epoch.current) setWorkspace(data);
  }, []);
  useEffect(() => {
    let active = true;
    bootstrap ??= api<SessionResponse>('/auth/session');
    bootstrap
      .then(async (value) => {
        if (!active) return;
        setCsrf(value.csrfToken);
        setSession(value);
        if (value.user) await refresh();
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    const handler = () => setView(viewFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 7000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (text: string, error = false) => setToast({ text, error });
  const changeSession = async (value: SessionResponse) => {
    epoch.current++;
    setWorkspace(empty);
    setSelected(null);
    setEditing(undefined);
    setQuery('');
    setCsrf(value.csrfToken);
    setSession(value);
    if (value.user) await refresh();
  };
  const authenticate = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const value = await api<SessionResponse>(path, 'POST', body);
      await changeSession(value);
      setView('overview');
      location.hash = 'overview';
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không thể đăng nhập.', true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (operation: () => Promise<unknown>, message?: string, isWrite = true) => {
    setBusy(true);
    let saved = false;
    try {
      await operation();
      saved = isWrite;
      await refresh();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify(
        saved
          ? 'Thay đổi đã được lưu, nhưng chưa tải được dữ liệu mới. Hãy tải lại dữ liệu.'
          : e instanceof Error
            ? e.message
            : 'Không thể lưu thay đổi.',
        true,
      );
      if (e instanceof ApiError && e.status === 401) {
        epoch.current++;
        setWorkspace(empty);
        setSelected(null);
        setEditing(undefined);
        setSession(null);
        setCsrf('');
        try {
          const value = await api<SessionResponse>('/auth/session');
          setCsrf(value.csrfToken);
          setSession(value);
        } catch (sessionError) {
          setError(
            sessionError instanceof Error
              ? sessionError.message
              : 'Không thể mở lại phiên đăng nhập.',
          );
        }
      }
      return saved;
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api('/auth/logout', 'POST');
      epoch.current++;
      setWorkspace(empty);
      setSelected(null);
      setEditing(undefined);
      setSession(null);
      setCsrf('');
      await changeSession(await api<SessionResponse>('/auth/session'));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không thể đăng xuất.', true);
    } finally {
      setBusy(false);
    }
  };
  const nav = (next: View) => {
    setView(next);
    location.hash = next;
    setMobileNav(false);
  };
  const save = async (value: ApplicationInput) => {
    const current = editing;
    const success = await mutate(
      () =>
        current?.id
          ? api(`/applications/${current.id}`, 'PUT', { ...value, version: current.version })
          : api('/applications', 'POST', value),
      'Đã lưu hồ sơ.',
    );
    if (success) setEditing(undefined);
    return success;
  };
  const toggleTask = (task: Task) =>
    void mutate(() => api(`/tasks/${task.id}`, 'PATCH', { completed: !task.completed }));
  const active = workspace.applications.find((item) => item.id === selected);
  const normalized = query.trim().toLocaleLowerCase('vi');
  const filtered = workspace.applications.filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      `${item.company} ${item.role} ${item.location}`.toLocaleLowerCase('vi').includes(normalized),
  );
  const pending = workspace.tasks.filter((task) => !task.completed);
  const visibleTasks = workspace.tasks.filter(
    (task) =>
      (taskFilter === 'all' || task.completed === (taskFilter === 'done')) &&
      `${task.title} ${workspace.applications.find((item) => item.id === task.applicationId)?.company ?? ''}`
        .toLocaleLowerCase('vi')
        .includes(normalized),
  );
  const openCount = workspace.applications.filter((item) =>
    ['saved', 'applied', 'interview'].includes(item.status),
  ).length;
  const interviewCount = workspace.applications.filter(
    (item) => item.status === 'interview',
  ).length;
  const upcoming = pending.filter((task) => task.dueDate && daysUntil(task.dueDate) <= 7).length;
  const dateText = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const closeDetail = useCallback(() => setSelected(null), []),
    closeForm = useCallback(() => setEditing(undefined), []);
  if (loading || error)
    return (
      <div className="loading-screen">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button primary" onClick={() => location.reload()}>
              Thử lại
            </button>
          </>
        ) : (
          <>
            <div className="loader" />
            <p>Đang mở không gian của bạn…</p>
          </>
        )}
      </div>
    );
  return (
    <>
      {!session?.user ? (
        <AuthScreen busy={busy} demoEnabled={!!session?.demoEnabled} onSubmit={authenticate} />
      ) : (
        <div className="app-shell" inert={editing !== undefined || !!active}>
          <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('main-content')?.focus();
            }}
          >
            Đi đến nội dung chính
          </a>
          <aside id="primary-navigation" className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
            <Brand />
            <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
            <nav aria-label="Điều hướng chính">
              {(
                [
                  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
                  { key: 'applications', label: 'Hồ sơ ứng tuyển', icon: BriefcaseBusiness },
                  { key: 'tasks', label: 'Việc cần làm', icon: ListChecks },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  onClick={() => nav(item.key)}
                  className={view === item.key ? 'nav-item active' : 'nav-item'}
                  aria-current={view === item.key ? 'page' : undefined}
                >
                  <item.icon size={19} />
                  {item.label}
                  {item.key === 'tasks' && pending.length > 0 && (
                    <span className="nav-count">{pending.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="sidebar-tip">
              <div>
                <Sparkles size={17} />
                <span>MỖI BƯỚC ĐỀU CÓ Ý NGHĨA</span>
              </div>
              <p>Một hồ sơ phù hợp tốt hơn nhiều hồ sơ gửi vội.</p>
              <button
                onClick={() => {
                  nav('applications');
                  setEditing(null);
                }}
              >
                Chuẩn bị cơ hội mới <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="sidebar-bottom">
              <span className="version">ApplyFlow · v1.0</span>
              <p>Small steps. Next chapter.</p>
            </div>
          </aside>
          <div className="main-wrap">
            <header className="topbar">
              <button
                className="icon-button mobile-menu"
                aria-controls="primary-navigation"
                aria-expanded={mobileNav}
                aria-label={mobileNav ? 'Đóng menu' : 'Mở menu'}
                onClick={() => setMobileNav((value) => !value)}
              >
                {mobileNav ? <X size={20} /> : <Menu size={20} />}
              </button>
              <label className="search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm công ty, vị trí, việc cần làm…"
                  aria-label="Tìm kiếm"
                  maxLength={120}
                />
                {query && (
                  <button
                    className="icon-button small"
                    onClick={() => setQuery('')}
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  aria-label="Tải lại dữ liệu"
                  title="Tải lại dữ liệu"
                  disabled={busy}
                  onClick={() => void mutate(async () => {}, undefined, false)}
                >
                  <RefreshCw size={17} />
                </button>
                <div className="profile">
                  <span className="avatar">{initials(session.user.name)}</span>
                  <div>
                    <strong>{session.user.name}</strong>
                    <span>
                      {session.user.isDemo ? 'Không gian dùng thử' : 'Không gian cá nhân'}
                    </span>
                  </div>
                </div>
                <button
                  className="icon-button logout"
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                  onClick={() => void logout()}
                  disabled={busy}
                >
                  <LogOut size={18} />
                </button>
              </div>
            </header>
            <main id="main-content" tabIndex={-1}>
              {session.user.isDemo && (
                <div className="demo-banner">
                  <Sparkles size={15} />
                  <span>
                    Bạn đang dùng dữ liệu hư cấu trong một không gian riêng. Có thể chỉnh sửa để
                    khám phá.
                  </span>
                  <strong>DEMO</strong>
                </div>
              )}
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{view === 'overview' ? dateText : 'YOUR NEXT CHAPTER'}</p>
                  <h1>
                    {view === 'overview'
                      ? `Chào ${session.user.name.split(' ').at(-1)}, sẵn sàng bước tiếp?`
                      : view === 'applications'
                        ? 'Mỗi cơ hội, một bước tiến.'
                        : 'Chuẩn bị tốt, tự tin hơn.'}
                  </h1>
                  <p>
                    {view === 'overview'
                      ? 'Gom mọi cơ hội vào một nơi. Biết rõ điều bạn cần làm hôm nay.'
                      : view === 'applications'
                        ? 'Theo dõi từ khi tìm thấy vị trí đến khi chọn nơi thực tập.'
                        : 'Những việc nhỏ giúp bạn đến gần cơ hội phù hợp.'}
                  </p>
                </div>
                <button className="button primary" onClick={() => setEditing(null)} disabled={busy}>
                  <Plus size={18} />
                  Thêm hồ sơ
                </button>
              </div>
              {view === 'overview' ? (
                <>
                  <div className="stats-grid">
                    <Stat
                      label="Tổng hồ sơ"
                      value={workspace.applications.length}
                      note="Cơ hội đã ghi lại"
                      icon={<BriefcaseBusiness />}
                    />
                    <Stat
                      label="Đang theo dõi"
                      value={openCount}
                      note="Đã lưu, đã gửi & phỏng vấn"
                      icon={<Target />}
                    />
                    <Stat
                      label="Chờ phỏng vấn"
                      value={interviewCount}
                      note="Sẵn sàng cho cuộc trò chuyện"
                      icon={<CalendarDays />}
                    />
                    <Stat
                      label="Việc trong 7 ngày"
                      value={upcoming}
                      note="Bao gồm các việc đã quá hạn"
                      icon={<ListChecks />}
                    />
                  </div>
                  <div className="overview-grid">
                    <div className="overview-main">
                      <section className="panel">
                        <div className="section-heading">
                          <div>
                            <h2>Hành trình ứng tuyển</h2>
                            <p>Mọi hồ sơ, theo từng bước.</p>
                          </div>
                          <button className="text-button" onClick={() => nav('applications')}>
                            Xem bảng
                            <ArrowRight size={16} />
                          </button>
                        </div>
                        <div className="pipeline-summary">
                          {STATUSES.map((status) => (
                            <button
                              key={status}
                              className={`summary-stage stage-${status}`}
                              onClick={() => {
                                setFilter(status);
                                nav('applications');
                              }}
                            >
                              <span className="stage-dot" />
                              <strong>
                                {
                                  workspace.applications.filter((item) => item.status === status)
                                    .length
                                }
                              </strong>
                              <span>{STATUS_LABELS[status]}</span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="panel">
                        <div className="section-heading">
                          <div>
                            <h2>Hồ sơ gần đây</h2>
                            <p>Cập nhật gần nhất trong không gian của bạn.</p>
                          </div>
                          <button className="text-button" onClick={() => nav('applications')}>
                            Tất cả
                            <ArrowRight size={16} />
                          </button>
                        </div>
                        {filtered.length ? (
                          <div className="recent-list">
                            {filtered.slice(0, 4).map((item) => (
                              <button
                                key={item.id}
                                className="recent-row"
                                onClick={() => setSelected(item.id)}
                              >
                                <CompanyMark company={item.company} />
                                <div>
                                  <strong>{item.role}</strong>
                                  <span>
                                    {item.company} · {item.location || MODE_LABELS[item.workMode]}
                                  </span>
                                </div>
                                <StatusBadge status={item.status} />
                                <ArrowUpRight size={17} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title={
                              query ? 'Chưa thấy hồ sơ phù hợp' : 'Cơ hội đầu tiên đang chờ bạn'
                            }
                            text={
                              query
                                ? 'Thử một từ khóa khác.'
                                : 'Lưu một vị trí bạn quan tâm và chuẩn bị từng bước.'
                            }
                            action={!query ? () => setEditing(null) : undefined}
                          />
                        )}
                      </section>
                      <section className="panel activity-panel">
                        <div className="section-heading">
                          <h2>Dấu chân gần đây</h2>
                          <span>Cập nhật tự động</span>
                        </div>
                        {workspace.activities.length ? (
                          <ul className="activity-list">
                            {workspace.activities.slice(0, 4).map((item) => (
                              <li key={item.id}>
                                <span className="activity-dot" />
                                <div>
                                  <p>{item.message}</p>
                                  <time dateTime={item.createdAt}>
                                    {new Intl.DateTimeFormat('vi-VN', {
                                      day: 'numeric',
                                      month: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }).format(new Date(item.createdAt))}
                                  </time>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">
                            Những thay đổi bạn thực hiện sẽ xuất hiện tại đây.
                          </p>
                        )}
                      </section>
                    </div>
                    <aside className="overview-aside">
                      <section className="panel">
                        <div className="section-heading">
                          <div>
                            <h2>Ưu tiên tiếp theo</h2>
                            <p>Việc chưa hoàn thành, theo hạn.</p>
                          </div>
                          <span className="number-pill">{pending.length}</span>
                        </div>
                        {pending.length ? (
                          <div className="task-list">
                            {pending.slice(0, 4).map((task) => (
                              <TaskItem
                                key={task.id}
                                task={task}
                                application={workspace.applications.find(
                                  (item) => item.id === task.applicationId,
                                )}
                                onToggle={toggleTask}
                                onOpen={(item) => setSelected(item.id)}
                                busy={busy}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="small-empty">
                            <Check size={23} />
                            <p>Bạn đã xử lý hết việc đã ghi lại.</p>
                          </div>
                        )}
                        <button className="button secondary wide" onClick={() => nav('tasks')}>
                          Xem việc cần làm
                          <ArrowRight size={16} />
                        </button>
                      </section>
                      <section className="guide-card">
                        <span className="guide-kicker">
                          <Sparkles size={16} />
                          MỘT CHÚT CHUẨN BỊ
                        </span>
                        <h2>
                          Đừng chỉ gửi CV.
                          <br />
                          Hãy kể câu chuyện của bạn.
                        </h2>
                        <p>
                          Chọn một dự án liên quan đến vị trí. Tập giải thích vấn đề, cách giải
                          quyết và điều bạn học được.
                        </p>
                        <ul>
                          <li>
                            <Check size={15} />
                            Đọc kỹ mô tả công việc
                          </li>
                          <li>
                            <Check size={15} />
                            Điều chỉnh CV cho vị trí
                          </li>
                          <li>
                            <Check size={15} />
                            Chuẩn bị câu hỏi cho người phỏng vấn
                          </li>
                        </ul>
                        <span className="guide-foot">
                          YOUR NEXT CHAPTER STARTS HERE <ArrowUpRight size={18} />
                        </span>
                      </section>
                    </aside>
                  </div>
                </>
              ) : view === 'applications' ? (
                <section className="applications-section">
                  <div className="workspace-toolbar">
                    <div className="filter-tabs" role="group" aria-label="Lọc trạng thái">
                      <button
                        className={filter === 'all' ? 'selected' : ''}
                        onClick={() => setFilter('all')}
                      >
                        Tất cả<span>{workspace.applications.length}</span>
                      </button>
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          className={filter === status ? 'selected' : ''}
                          onClick={() => setFilter(status)}
                        >
                          {STATUS_LABELS[status]}
                          <span>
                            {workspace.applications.filter((item) => item.status === status).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="view-controls">
                      <button
                        className="icon-button"
                        title="Xuất CSV"
                        aria-label="Xuất các hồ sơ đang hiển thị ra CSV"
                        disabled={!filtered.length}
                        onClick={() => exportApplications(filtered)}
                      >
                        <Download size={18} />
                      </button>
                      <div className="view-switch">
                        <button
                          className={board ? 'selected' : ''}
                          aria-label="Dạng bảng trạng thái"
                          aria-pressed={board}
                          onClick={() => setBoard(true)}
                        >
                          <Columns3 size={17} />
                        </button>
                        <button
                          className={!board ? 'selected' : ''}
                          aria-label="Dạng danh sách"
                          aria-pressed={!board}
                          onClick={() => setBoard(false)}
                        >
                          <List size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {!workspace.applications.length ? (
                    <div className="panel">
                      <Empty
                        title="Bắt đầu với một cơ hội phù hợp"
                        text="Lưu vị trí, đặt hạn ứng tuyển và lên kế hoạch chuẩn bị."
                        action={() => setEditing(null)}
                      />
                    </div>
                  ) : !filtered.length ? (
                    <div className="panel">
                      <Empty
                        title="Chưa thấy hồ sơ phù hợp"
                        text="Thay đổi từ khóa hoặc trạng thái để tiếp tục tìm."
                      />
                    </div>
                  ) : board ? (
                    <div className="board-scroll" aria-label="Bảng trạng thái ứng tuyển">
                      <div className={`board-grid ${filter !== 'all' ? 'single-lane' : ''}`}>
                        {STATUSES.filter((status) => filter === 'all' || status === filter).map(
                          (status) => (
                            <section className={`board-lane stage-${status}`} key={status}>
                              <header>
                                <span className="stage-dot" />
                                <h2>{STATUS_LABELS[status]}</h2>
                                <span>
                                  {filtered.filter((item) => item.status === status).length}
                                </span>
                                <button
                                  className="icon-button small"
                                  aria-label={`Thêm hồ sơ ở trạng thái ${STATUS_LABELS[status]}`}
                                  onClick={() =>
                                    setEditing({
                                      ...{
                                        company: '',
                                        role: '',
                                        location: '',
                                        workMode: 'hybrid',
                                        url: '',
                                        deadline: '',
                                        appliedOn: '',
                                        notes: '',
                                        id: 0,
                                        version: 1,
                                        createdAt: '',
                                        updatedAt: '',
                                      },
                                      status,
                                    } as Application)
                                  }
                                >
                                  <Plus size={15} />
                                </button>
                              </header>
                              {filtered
                                .filter((item) => item.status === status)
                                .map((item) => (
                                  <ApplicationCard
                                    key={item.id}
                                    item={item}
                                    onOpen={(item) => setSelected(item.id)}
                                  />
                                ))}
                              {!filtered.some((item) => item.status === status) && (
                                <p className="lane-empty">Chưa có hồ sơ ở bước này.</p>
                              )}
                            </section>
                          ),
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="panel table-scroll">
                      <table className="application-table">
                        <thead>
                          <tr>
                            <th>Vị trí & công ty</th>
                            <th>Địa điểm</th>
                            <th>Trạng thái</th>
                            <th>Hạn ứng tuyển</th>
                            <th>
                              <span className="sr-only">Chi tiết</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <button className="table-role" onClick={() => setSelected(item.id)}>
                                  <CompanyMark company={item.company} />
                                  <span>
                                    <strong>{item.role}</strong>
                                    <span>{item.company}</span>
                                  </span>
                                </button>
                              </td>
                              <td>
                                {item.location || '—'}
                                <small>{MODE_LABELS[item.workMode]}</small>
                              </td>
                              <td>
                                <StatusBadge status={item.status} />
                              </td>
                              <td>{item.deadline ? dateLabel(item.deadline) : '—'}</td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Mở hồ sơ ${item.company}`}
                                  onClick={() => setSelected(item.id)}
                                >
                                  <ArrowUpRight size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="workspace-footnote">
                    {filtered.length} hồ sơ đang hiển thị · Bấm vào một hồ sơ để chuyển bước, ghi
                    chú và thêm việc chuẩn bị.
                  </p>
                </section>
              ) : (
                <section className="panel tasks-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Danh sách việc cần làm</h2>
                      <p>
                        Việc gắn với từng hồ sơ. Bạn có thể thêm việc trong phần chi tiết hồ sơ.
                      </p>
                    </div>
                    <div className="segmented" role="group" aria-label="Lọc việc">
                      <button
                        className={taskFilter === 'pending' ? 'selected' : ''}
                        onClick={() => setTaskFilter('pending')}
                      >
                        Cần làm
                      </button>
                      <button
                        className={taskFilter === 'done' ? 'selected' : ''}
                        onClick={() => setTaskFilter('done')}
                      >
                        Đã xong
                      </button>
                      <button
                        className={taskFilter === 'all' ? 'selected' : ''}
                        onClick={() => setTaskFilter('all')}
                      >
                        Tất cả
                      </button>
                    </div>
                  </div>
                  {visibleTasks.length ? (
                    visibleTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        application={workspace.applications.find(
                          (item) => item.id === task.applicationId,
                        )}
                        onToggle={toggleTask}
                        onOpen={(item) => setSelected(item.id)}
                        busy={busy}
                      />
                    ))
                  ) : (
                    <Empty
                      title={
                        query
                          ? 'Chưa có việc phù hợp'
                          : taskFilter === 'pending'
                            ? 'Nhẹ một chút, mọi việc đã xong'
                            : 'Chưa có việc ở mục này'
                      }
                      text="Mở một hồ sơ để thêm việc chuẩn bị và đặt ngày hoàn thành."
                    />
                  )}
                </section>
              )}
              <footer className="page-footer">
                <span>ApplyFlow</span>
                <p>Sắp xếp hôm nay. Sẵn sàng cho ngày mai.</p>
                <a
                  href="https://github.com/nguyenhonggiang2407"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Một dự án portfolio
                  <ArrowUpRight size={13} />
                </a>
              </footer>
            </main>
          </div>
        </div>
      )}
      {editing !== undefined && (
        <ApplicationForm
          key={editing?.id ?? 'new'}
          item={editing ?? null}
          onSave={save}
          onClose={closeForm}
          busy={busy}
        />
      )}{' '}
      {active && (
        <ApplicationDetail
          key={active.id}
          item={active}
          tasks={workspace.tasks.filter((task) => task.applicationId === active.id)}
          onClose={closeDetail}
          onEdit={() => {
            setSelected(null);
            setEditing(active);
          }}
          onStatus={(status) =>
            void mutate(
              () =>
                api(`/applications/${active.id}`, 'PUT', {
                  company: active.company,
                  role: active.role,
                  location: active.location,
                  workMode: active.workMode,
                  status,
                  url: active.url,
                  deadline: active.deadline,
                  appliedOn: active.appliedOn || (status === 'applied' ? today() : ''),
                  notes: active.notes,
                  version: active.version,
                }),
              'Đã chuyển bước.',
            )
          }
          onDelete={() =>
            void mutate(() => api(`/applications/${active.id}`, 'DELETE'), 'Đã xóa hồ sơ.').then(
              (success) => {
                if (success) setSelected(null);
              },
            )
          }
          onTask={(title, dueDate) =>
            mutate(
              () => api(`/applications/${active.id}/tasks`, 'POST', { title, dueDate }),
              'Đã thêm việc.',
            )
          }
          onToggle={toggleTask}
          onTaskDelete={(task) =>
            void mutate(() => api(`/tasks/${task.id}`, 'DELETE'), 'Đã xóa việc.')
          }
          busy={busy}
        />
      )}{' '}
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <span>{toast.text}</span>
          <button
            className="icon-button small"
            aria-label="Đóng thông báo"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function Brand() {
  return (
    <a className="brand" href="#overview" aria-label="ApplyFlow trang tổng quan">
      <span className="brand-mark">
        A<span />
      </span>
      <strong>
        Apply<span>Flow</span>
      </strong>
    </a>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, '0')}</strong>
      <p>{note}</p>
    </article>
  );
}
function Empty({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button primary compact" onClick={action}>
          <Plus size={16} />
          Thêm hồ sơ đầu tiên
        </button>
      )}
    </div>
  );
}
function AuthScreen({
  busy,
  demoEnabled,
  onSubmit,
}: {
  busy: boolean;
  demoEnabled: boolean;
  onSubmit: (path: string, body?: unknown) => Promise<boolean>;
}) {
  const [register, setRegister] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(
      register ? '/auth/register' : '/auth/login',
      register ? { name, email, password } : { email, password },
    );
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div className="story-content">
          <p className="story-kicker">
            <span />
            YOUR NEXT CHAPTER
          </p>
          <h1>
            Một nơi cho
            <br />
            mọi <em>cơ hội.</em>
          </h1>
          <p className="story-lead">
            Từ hồ sơ đầu tiên đến buổi phỏng vấn tiếp theo.
            <br />
            Theo dõi rõ ràng. Chuẩn bị tự tin.
          </p>
          <div className="story-preview">
            <div className="preview-top">
              <span>HÀNH TRÌNH CỦA BẠN</span>
              <span>
                <i />
                Đang tiến lên
              </span>
            </div>
            <div className="preview-progress">
              <div>
                <Check size={14} />
              </div>
              <span />
              <div>
                <Check size={14} />
              </div>
              <span />
              <div className="current">3</div>
              <span />
              <div>4</div>
            </div>
            <div className="preview-labels">
              <span>Đã lưu</span>
              <span>Ứng tuyển</span>
              <strong>Phỏng vấn</strong>
              <span>Đề nghị</span>
            </div>
            <div className="preview-card">
              <CompanyMark company="Nori Studio" />
              <div>
                <strong>Frontend Developer Intern</strong>
                <span>Nori Studio · Dữ liệu minh họa</span>
              </div>
              <span className="preview-arrow">
                <ArrowUpRight size={19} />
              </span>
            </div>
            <p>
              <CalendarDays size={15} />
              Bước tiếp theo: chuẩn bị câu chuyện dự án
            </p>
          </div>
          <div className="story-points">
            <span>
              <Check size={16} />
              Theo dõi từng bước
            </span>
            <span>
              <Check size={16} />
              Nhắc việc bằng hạn cụ thể
            </span>
            <span>
              <Check size={16} />
              Không gian riêng cho mỗi người
            </span>
          </div>
        </div>
        <footer>
          Small steps. <strong>Next chapter.</strong>
          <span>ApplyFlow · Student portfolio project</span>
        </footer>
      </div>
      <div className="auth-side">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          <span className="auth-icon">
            <BriefcaseBusiness size={24} />
          </span>
          <p className="eyebrow">WELCOME TO APPLYFLOW</p>
          <h2>{register ? 'Bắt đầu hành trình của bạn.' : 'Tiếp tục hành trình của bạn.'}</h2>
          <p>Lưu cơ hội, chuẩn bị từng bước và giữ mọi thứ trong tầm nhìn.</p>
          <div className="auth-tabs" role="group" aria-label="Chọn đăng nhập hoặc tạo tài khoản">
            <button
              className={!register ? 'selected' : ''}
              onClick={() => setRegister(false)}
              disabled={busy}
            >
              Đăng nhập
            </button>
            <button
              className={register ? 'selected' : ''}
              onClick={() => setRegister(true)}
              disabled={busy}
            >
              Tạo tài khoản
            </button>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                Tên của bạn
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bạn muốn được gọi là gì?"
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={register ? 10 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={register ? 'Ít nhất 10 ký tự' : 'Nhập mật khẩu của bạn'}
              />
            </label>
            {register && (
              <p className="auth-hint">
                Dùng email và mật khẩu dành riêng cho dự án demo. Hiện chưa có xác minh email hoặc
                khôi phục mật khẩu.
              </p>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy ? 'Đang xử lý…' : register ? 'Tạo không gian của tôi' : 'Đăng nhập'}
              <ArrowRight size={18} />
            </button>
          </form>
          {demoEnabled && (
            <>
              <div className="auth-divider">
                <span>hoặc khám phá trước</span>
              </div>
              <button
                className="button secondary wide demo-button"
                onClick={() => void onSubmit('/auth/demo')}
                disabled={busy}
              >
                <Sparkles size={17} />
                Dùng thử với dữ liệu mẫu
              </button>
              <p className="auth-note">
                <CircleHelp size={14} />
                Dữ liệu dùng thử là hư cấu, mỗi lần mở có một không gian riêng.
              </p>
            </>
          )}
        </div>
        <div className="auth-bottom">Made for students taking their next step.</div>
      </div>
    </div>
  );
}
