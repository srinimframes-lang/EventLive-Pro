import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

/**
 * Verifies a JWT from the Authorization header (Bearer) or an httpOnly cookie,
 * then attaches the authenticated user to `req.user`.
 */
export async function protect(req, res, next) {
  try {
    let token;
    const header = req.headers.authorization;

    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      res.status(401);
      throw new Error('Not authorized, no token provided');
    }

    const decoded = jwt.verify(token, env.jwt.secret);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401);
      throw new Error('Not authorized, user no longer exists');
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Like `protect`, but never blocks the request. If a valid token is present the
 * user is attached to `req.user`; otherwise the request continues anonymously.
 * Useful for public endpoints that personalise results when logged in.
 */
export async function optionalAuth(req, res, next) {
  try {
    let token;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, env.jwt.secret);
      const user = await User.findById(decoded.id);
      if (user) req.user = user;
    }
  } catch {
    // Ignore invalid/expired tokens for optional auth.
  }
  return next();
}

/**
 * Restricts a route to one or more roles. Use after `protect`.
 * @param {...string} roles
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      return next(new Error('You do not have permission to perform this action'));
    }
    return next();
  };
}
