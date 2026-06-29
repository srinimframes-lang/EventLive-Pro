import { User } from '../models/User.js';
import { generateToken, cookieOptions } from '../utils/generateToken.js';

/**
 * Helper: issue a token, set the cookie, and return a clean response payload.
 */
function sendAuthResponse(res, statusCode, user) {
  const token = generateToken(user._id);
  res.cookie('token', token, cookieOptions());
  res.status(statusCode).json({
    success: true,
    token,
    user,
  });
}

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate a user and return a JWT
 * @access  Public
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error('Please provide email and password');
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
      '+password'
    );
    if (!user || !(await user.comparePassword(password))) {
      res.status(401);
      throw new Error('Invalid email or password');
    }

    if (user.isActive === false) {
      res.status(403);
      throw new Error('This account has been deactivated. Please contact support.');
    }

    user.password = undefined;
    sendAuthResponse(res, 200, user);
  } catch (error) {
    next(error);
  }
}

/**
 * @route   POST /api/auth/logout
 * @desc    Clear the auth cookie
 * @access  Public
 */
export async function logout(req, res) {
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out' });
}

/**
 * @route   GET /api/auth/me
 * @desc    Get the currently authenticated user
 * @access  Private
 */
export async function getMe(req, res) {
  res.status(200).json({ success: true, user: req.user });
}
