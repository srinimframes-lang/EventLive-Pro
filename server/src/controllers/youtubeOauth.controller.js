import { asyncHandler } from '../utils/asyncHandler.js';
import {
  youtubeOauthConfigured,
  sanitizeReturnTo,
  frontendOAuthRedirectUrl,
  mapOauthCallbackError,
  safeYoutubeStatusPayload,
  createOauthState,
  consumeOauthState,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  persistYoutubeTokens,
  loadUserCredential,
  disconnectUserYoutube,
} from '../utils/youtubeOauth.js';

function wantsJson(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('application/json') || req.query.format === 'json';
}

function redirectToFrontend(res, returnTo, params) {
  return res.redirect(302, frontendOAuthRedirectUrl(returnTo, params));
}

/**
 * @route GET /api/youtube/oauth/start
 * @access Private
 */
export const startYoutubeOauth = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }
  if (!youtubeOauthConfigured()) {
    res.status(503);
    throw new Error('YouTube connection is not configured yet.');
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo, req.user);
  const state = await createOauthState(req.user._id, returnTo);
  const authUrl = buildGoogleAuthUrl(state);

  if (wantsJson(req)) {
    return res.status(200).json({ success: true, data: { authUrl } });
  }
  return res.redirect(302, authUrl);
});

/**
 * @route GET /api/youtube/oauth/callback
 * @access Public (state binds the EventLivePro user)
 */
export const youtubeOauthCallback = asyncHandler(async (req, res) => {
  const denial = mapOauthCallbackError(req.query);
  if (denial) {
    return redirectToFrontend(res, '/dashboard', { youtube: denial });
  }

  let row;
  try {
    row = await consumeOauthState(req.query.state);
  } catch (err) {
    const reason = err.code === 'expired_state' ? 'expired' : 'invalid';
    return redirectToFrontend(res, '/dashboard', { youtube: reason });
  }

  const code = String(req.query.code || '').trim();
  if (!code) {
    return redirectToFrontend(res, row.returnTo, { youtube: 'invalid' });
  }

  try {
    const { tokens, channel } = await exchangeCodeForTokens(code);
    await persistYoutubeTokens(row.user, { tokens, channel });
    return redirectToFrontend(res, row.returnTo, { youtube: 'connected' });
  } catch {
    return redirectToFrontend(res, row.returnTo, { youtube: 'error' });
  }
});

/**
 * @route GET /api/youtube/oauth/status
 * @access Private
 */
export const youtubeOauthStatus = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }
  const cred = await loadUserCredential(req.user._id);
  return res.status(200).json({
    success: true,
    data: safeYoutubeStatusPayload(cred),
  });
});

/**
 * @route POST /api/youtube/oauth/disconnect
 * @access Private — only the authenticated user's own connection
 */
export const disconnectYoutubeOauth = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }
  if (req.body?.userId && String(req.body.userId) !== String(req.user._id)) {
    res.status(403);
    throw new Error('You can only disconnect your own YouTube account');
  }
  const result = await disconnectUserYoutube(req.user._id);
  return res.status(200).json({
    success: true,
    data: {
      disconnected: Boolean(result.disconnected),
      connected: false,
      channelId: '',
      channelTitle: '',
    },
  });
});
