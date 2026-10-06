import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { ResourceGuard } from './core/guards/resource.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { permission: 'dashboard:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'users',
        data: { permission: 'users:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'admissions',
        data: { permission: 'admissions:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/admissions/admissions.component').then((m) => m.AdmissionsComponent),
      },
      {
        path: 'attendance',
        data: { permission: 'attendance:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/attendance/attendance.component').then((m) => m.AttendanceComponent),
      },
      {
        path: 'invoices',
        data: { permission: 'invoices:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/invoices/invoices.component').then((m) => m.InvoicesComponent),
      },
      {
        path: 'reports',
        data: { permission: 'reports:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'audit-logs',
        data: { permission: 'audit-logs:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/audit-logs/audit-logs.component').then((m) => m.AuditLogsComponent),
      },
      {
        path: 'permissions',
        data: { permission: 'permissions:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/permissions/permissions.component').then((m) => m.PermissionsComponent),
      },
      {
        path: 'students',
        data: { permission: 'students:read' },
        canActivate: [PermissionGuard],
        loadComponent: () => import('./features/students/students.component').then((m) => m.StudentsComponent),
      },
      {
        path: 'staff',
        data: { permission: 'staff:read' },
        canActivate: [PermissionGuard],
        loadComponent: () => import('./features/employees/employees.component').then((m) => m.EmployeesComponent),
      },
      {
        path: 'payroll',
        data: { permission: 'payroll:read' },
        canActivate: [PermissionGuard],
        loadComponent: () => import('./features/payroll/payroll.component').then((m) => m.PayrollComponent),
      },
      {
        path: 'hostel-allocations',
        data: { permission: 'hostel-allocations:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/hostel/hostel-allocations.component').then((m) => m.HostelAllocationsComponent),
      },
      {
        path: 'roles',
        data: { permission: 'roles:read' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/roles/role-permissions.component').then((m) => m.RolePermissionsComponent),
      },
      {
        path: 'settings',
        data: { permission: 'settings:manage' },
        canActivate: [PermissionGuard],
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'forbidden',
        loadComponent: () =>
          import('./features/errors/forbidden.component').then((m) => m.ForbiddenComponent),
      },
      {
        path: 'not-found',
        loadComponent: () =>
          import('./features/errors/not-found.component').then((m) => m.NotFoundComponent),
      },
      // Generic config-driven CRUD for every registered resource (see resources.config.ts).
      {
        path: ':resource',
        canActivate: [ResourceGuard],
        loadComponent: () =>
          import('./features/resources/crud-resource.component').then((m) => m.CrudResourceComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'not-found' },
];