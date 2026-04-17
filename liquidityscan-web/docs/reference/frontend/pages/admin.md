# Pages: Admin

**Layout:** [`AdminLayout.tsx`](../../../../frontend/src/pages/admin/AdminLayout.tsx) — enforces `user.isAdmin` (typically client-side + API 403).

| File | Route | Purpose |
|------|-------|---------|
| [`AdminDashboard.tsx`](../../../../frontend/src/pages/admin/AdminDashboard.tsx) | `/admin` | KPIs from `GET /api/admin/dashboard` |
| [`UsersManagement.tsx`](../../../../frontend/src/pages/admin/UsersManagement.tsx) | `/admin/users` | User table, search, grants filter |
| [`AdminUserDetail.tsx`](../../../../frontend/src/pages/admin/AdminUserDetail.tsx) | `/admin/users/:id` | Edit user, features, subscription |
| [`PaymentsManagement.tsx`](../../../../frontend/src/pages/admin/PaymentsManagement.tsx) | `/admin/payments` | Payment list, confirm/cancel |
| [`Analytics.tsx`](../../../../frontend/src/pages/admin/Analytics.tsx) | `/admin/analytics` | High-level analytics |
| [`CoursesManagement.tsx`](../../../../frontend/src/pages/admin/CoursesManagement.tsx) | `/admin/courses` | Course CRUD list |
| [`AdminCourseDetail.tsx`](../../../../frontend/src/pages/admin/AdminCourseDetail.tsx) | `/admin/courses/:id` | Chapter/lesson editor |
| [`AdminEmailLogs.tsx`](../../../../frontend/src/pages/admin/AdminEmailLogs.tsx) | `/admin/email-logs` | `EmailLog` viewer |
| [`AdminBroadcast.tsx`](../../../../frontend/src/pages/admin/AdminBroadcast.tsx) | `/admin/broadcast` | Email/Telegram broadcast |
| [`AdminSettings.tsx`](../../../../frontend/src/pages/admin/AdminSettings.tsx) | `/admin/settings` | Launch promo, CISD config, SMTP test |

**Backend:** [`AdminController`](../../backend/admin.md).
