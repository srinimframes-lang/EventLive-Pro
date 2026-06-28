import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Signs a JWT for the given user id.
 * @param {string} userId
 * @returns {string} signed JWT
 */
export function generateToken(userId) {
  return jwt.sign({ id: userId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

/**
 * Builds the cookie options used when sending the token as an httpOnly cookie.
 */
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: env.jwt.cookieExpiresDays * 24 * 60 * 60 * 1000,
  };
}
