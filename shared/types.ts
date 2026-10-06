export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'closed'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  saved: 'Đã lưu',
  applied: 'Đã ứng tuyển',
  interview: 'Phỏng vấn',
  offer: 'Đề nghị',
  closed: 'Đã khép lại',
};
export const WORK_MODES = ['hybrid', 'remote', 'onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const MODE_LABELS: Record<WorkMode, string> = {
  hybrid: 'Hybrid',
  remote: 'Remote',
  onsite: 'Tại văn phòng',
};
export interface User {
  id: number;
  name: string;
  email: string;
  isDemo: boolean;
}
export interface Application {
  id: number;
  company: string;
  role: string;
  location: string;
  workMode: WorkMode;
  status: Status;
  url: string;
  deadline: string;
  appliedOn: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type ApplicationInput = Pick<
  Application,
  | 'company'
  | 'role'
  | 'location'
  | 'workMode'
  | 'status'
  | 'url'
  | 'deadline'
  | 'appliedOn'
  | 'notes'
>;
export interface Task {
  id: number;
  applicationId: number;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
}
export interface Activity {
  id: number;
  applicationId: number | null;
  message: string;
  createdAt: string;
}
export interface SessionResponse {
  user: User | null;
  csrfToken: string;
  demoEnabled: boolean;
}
export interface Workspace {
  applications: Application[];
  tasks: Task[];
  activities: Activity[];
}
