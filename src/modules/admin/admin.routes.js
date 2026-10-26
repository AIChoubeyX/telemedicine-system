import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  analyticsQuerySchema,
  auditQuerySchema,
  userManagementQuerySchema,
  updateUserStatusSchema
} from './admin.schema.js';

const router = Router();

// All admin routes strictly require ADMIN role
router.use(authenticate, requireRole('ADMIN'));

router.get(
  '/analytics/overview',
  validate({ query: analyticsQuerySchema }),
  AdminController.getOverviewAnalytics
);

router.get(
  '/analytics/doctor-utilization',
  AdminController.getDoctorUtilization
);

router.get(
  '/audit-logs',
  validate({ query: auditQuerySchema }),
  AdminController.getAuditLogs
);

router.get(
  '/users',
  validate({ query: userManagementQuerySchema }),
  AdminController.listUsers
);

router.patch(
  '/users/:id/status',
  validate({ body: updateUserStatusSchema }),
  AdminController.updateUserStatus
);

export default router;
