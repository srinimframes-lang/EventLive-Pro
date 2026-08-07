import { asyncHandler } from '../utils/asyncHandler.js';
import {
  collectSystemHealth,
  listHealthLogs,
  pushHealthLog,
  restartService,
  runHealthTest,
} from '../utils/systemHealth.js';

/**
 * @route GET /api/admin/system-health
 * @desc  Full platform health snapshot (Super Admin)
 */
export const getSystemHealth = asyncHandler(async (_req, res) => {
  const data = await collectSystemHealth();
  res.status(200).json({ success: true, data });
});

/**
 * @route GET /api/admin/system-health/logs
 */
export const getSystemHealthLogs = asyncHandler(async (req, res) => {
  const level = req.query.level ? String(req.query.level) : undefined;
  const logs = listHealthLogs({ level });
  res.status(200).json({ success: true, data: logs });
});

/**
 * @route POST /api/admin/system-health/test
 * body: { test: 'rtmp'|'obs'|... }
 */
export const postSystemHealthTest = asyncHandler(async (req, res) => {
  const testId = String(req.body?.test || req.query.test || '').trim();
  if (!testId) {
    res.status(400);
    throw new Error('test id required');
  }
  const data = await runHealthTest(testId);
  res.status(200).json({ success: true, data });
});

/**
 * @route POST /api/admin/system-health/restart
 * body: { service: 'mediamtx'|'nginx'|'pm2'|'backend' }
 */
export const postSystemHealthRestart = asyncHandler(async (req, res) => {
  const service = String(req.body?.service || '').trim();
  if (!service) {
    res.status(400);
    throw new Error('service required');
  }
  const data = await restartService(service);
  res.status(data.ok ? 200 : 503).json({ success: data.ok, data });
});

/**
 * @route POST /api/admin/system-health/ack
 * Save a manual note / dismiss critical into logs
 */
export const postSystemHealthAck = asyncHandler(async (req, res) => {
  const message = String(req.body?.message || 'Acknowledged').slice(0, 500);
  const row = pushHealthLog({
    level: 'info',
    message,
    reason: String(req.body?.reason || '').slice(0, 500),
    fix: String(req.body?.fix || '').slice(0, 500),
    source: 'admin-ack',
  });
  res.status(200).json({ success: true, data: row });
});
