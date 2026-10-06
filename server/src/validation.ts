import { z } from 'zod';
import { STATUSES, WORK_MODES } from '../../shared/types.js';
const date = z.string().refine((value) => {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' &&
    value <= '2100-12-31'
  );
}, 'Ngày không hợp lệ.');
const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(10, 'Mật khẩu cần ít nhất 10 ký tự.').max(128);
export const registerSchema = z
  .object({ name: z.string().trim().min(2).max(80), email, password })
  .strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const applicationSchema = z
  .object({
    company: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(160),
    location: z.string().trim().max(100),
    workMode: z.enum(WORK_MODES),
    status: z.enum(STATUSES),
    url: z
      .string()
      .trim()
      .max(2000)
      .refine((value) => {
        if (!value) return true;
        try {
          const parsed = new URL(value);
          return (
            ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      }, 'Liên kết cần bắt đầu bằng http:// hoặc https://.'),
    deadline: date,
    appliedOn: date,
    notes: z.string().trim().max(5000),
  })
  .strict();
export const updateApplicationSchema = applicationSchema.extend({
  version: z.number().int().min(1),
});
export const taskSchema = z
  .object({ title: z.string().trim().min(1).max(200), dueDate: date })
  .strict();
export const taskUpdateSchema = z.object({ completed: z.boolean() }).strict();
