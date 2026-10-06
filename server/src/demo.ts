import type { ApplicationInput } from '../../shared/types.js';
import { Store } from './database.js';
export const APPLICATION_SELECT = `SELECT id, company, role, location, work_mode AS workMode, status, url, deadline, applied_on AS appliedOn, notes, version, created_at AS createdAt, updated_at AS updatedAt FROM applications`;
export function activity(
  store: Store,
  userId: number,
  applicationId: number | null,
  message: string,
) {
  store.run(
    'INSERT INTO activities(user_id,application_id,message,created_at) VALUES(?,?,?,?)',
    userId,
    applicationId,
    message,
    new Date().toISOString(),
  );
}
export function insertApplication(store: Store, userId: number, value: ApplicationInput) {
  const now = new Date().toISOString();
  const result = store.run(
    `INSERT INTO applications(user_id,company,role,location,work_mode,status,url,deadline,applied_on,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId,
    value.company,
    value.role,
    value.location,
    value.workMode,
    value.status,
    value.url,
    value.deadline,
    value.appliedOn,
    value.notes,
    now,
    now,
  );
  const id = Number(result.lastInsertRowid);
  activity(store, userId, id, `Đã thêm ${value.role} · ${value.company}`);
  return id;
}
const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
export function seedDemo(store: Store, userId: number) {
  const samples: ApplicationInput[] = [
    {
      company: 'Nori Studio',
      role: 'Frontend Developer Intern',
      location: 'TP. Hồ Chí Minh',
      workMode: 'hybrid',
      status: 'interview',
      deadline: day(8),
      appliedOn: day(-9),
      url: 'https://example.com/careers/nori',
      notes: 'Dữ liệu minh họa. Chuẩn bị trình bày một dự án React và cách xử lý trạng thái.',
    },
    {
      company: 'Orbit Labs',
      role: 'Full-stack Engineering Intern',
      location: 'Hà Nội',
      workMode: 'remote',
      status: 'applied',
      deadline: day(12),
      appliedOn: day(-4),
      url: 'https://example.com/careers/orbit',
      notes: 'Dữ liệu minh họa. Đã gửi CV và liên kết portfolio.',
    },
    {
      company: 'Mellow Digital',
      role: 'Product Design Intern',
      location: 'Đà Nẵng',
      workMode: 'onsite',
      status: 'saved',
      deadline: day(3),
      appliedOn: '',
      url: 'https://example.com/careers/mellow',
      notes: 'Dữ liệu minh họa. Đọc kỹ yêu cầu trước khi gửi hồ sơ.',
    },
    {
      company: 'Atlas Works',
      role: 'Backend Developer Intern',
      location: 'TP. Hồ Chí Minh',
      workMode: 'hybrid',
      status: 'applied',
      deadline: day(5),
      appliedOn: day(-6),
      url: '',
      notes: 'Dữ liệu minh họa. Ôn API, SQL và kiểm thử.',
    },
    {
      company: 'Pine & Co.',
      role: 'Software Engineer Intern',
      location: 'Hà Nội',
      workMode: 'remote',
      status: 'offer',
      deadline: day(7),
      appliedOn: day(-18),
      url: '',
      notes: 'Dữ liệu minh họa. So sánh phạm vi công việc và người hướng dẫn trước khi phản hồi.',
    },
    {
      company: 'Terra Apps',
      role: 'QA Engineer Intern',
      location: 'Cần Thơ',
      workMode: 'onsite',
      status: 'closed',
      deadline: '',
      appliedOn: day(-20),
      url: '',
      notes: 'Dữ liệu minh họa. Lưu lại bài học cho lần ứng tuyển tiếp theo.',
    },
    {
      company: 'Kite Systems',
      role: 'React Developer Intern',
      location: 'TP. Hồ Chí Minh',
      workMode: 'hybrid',
      status: 'saved',
      deadline: day(10),
      appliedOn: '',
      url: '',
      notes: 'Dữ liệu minh họa. Đối chiếu kỹ năng với mô tả công việc.',
    },
  ];
  const ids = samples.map((item) => insertApplication(store, userId, item));
  for (const item of [
    [ids[0], 'Chuẩn bị demo dự án React', day(1)],
    [ids[0], 'Ôn câu hỏi về API và SQL', day(2)],
    [ids[2], 'Điều chỉnh CV theo vị trí', day(2)],
    [ids[1], 'Gửi email hỏi tiến độ', day(4)],
    [ids[4], 'Đọc kỹ đề nghị thực tập', day(3)],
  ] as const)
    store.run(
      'INSERT INTO tasks(application_id,title,due_date,created_at) VALUES(?,?,?,?)',
      ...item,
      new Date().toISOString(),
    );
  activity(store, userId, ids[0], 'Chuyển Nori Studio sang Phỏng vấn');
}
