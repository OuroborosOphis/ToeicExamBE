import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Authorization Middleware Factory
 * 
 * Authorization is different from authentication:
 * - Authentication: "Who are you?" (Verified by authMiddleware)
 * - Authorization: "What are you allowed to do?" (Verified by these middlewares)
 * 
 * These middlewares check if an authenticated user has permission to
 * perform specific actions based on their role and ownership.
 * 
 * The factory pattern allows us to create role-specific middlewares
 * that can be applied to different routes easily.
 */

/**
 * Require specific role(s) middleware
 * 
 * This factory creates middleware that checks if the authenticated user
 * has one of the specified roles. If not, returns 403 Forbidden.
 * 
 * Usage in routes:
 * ```
 * router.post('/exams', 
 *   authMiddleware, 
 *   requireRole(['ADMIN', 'TEACHER']), 
 *   examController.create
 * );
 * ```
 * 
 * This ensures only admins and teachers can create exams.
 * 
 * @param allowedRoles - Array of roles that are permitted
 * @returns Middleware function that checks role
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // User must be authenticated to check role
    // This middleware should always come after authMiddleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // Check if user's role is in the allowed list
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        error: 'FORBIDDEN',
      });
      return;
    }

    // User has required role, continue to next handler
    next();
  };
};

/**
 * Require admin role middleware
 * 
 * Convenience middleware for routes that only admins can access.
 * This is common enough to warrant a dedicated helper.
 * 
 * Usage:
 * ```
 * router.delete('/exams/:id', authMiddleware, requireAdmin, examController.delete);
 * ```
 * 
 * @param req - Authenticated request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Admin access required',
      error: 'FORBIDDEN',
    });
    return;
  }

  next();
};

/**
 * Require teacher or admin role middleware
 * 
 * Many content management operations can be performed by both
 * teachers and admins. This middleware handles that common case.
 * 
 * Examples: Creating questions, moderating comments, viewing statistics.
 * 
 * @param req - Authenticated request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const requireTeacherOrAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.role !== 'TEACHER' && req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Teacher or admin access required',
      error: 'FORBIDDEN',
    });
    return;
  }

  next();
};

/**
 * Require student role middleware
 * 
 * Ensures the user is a student. Most exam-taking routes need this.
 * 
 * Note: We also check that studentProfileId exists because a user
 * record might exist without a student profile (e.g., teachers).
 * 
 * @param req - Authenticated request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const requireStudent = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.role !== 'STUDENT') {
    res.status(403).json({
      success: false,
      message: 'Student access required',
      error: 'FORBIDDEN',
    });
    return;
  }

  if (!req.user.studentProfileId) {
    res.status(403).json({
      success: false,
      message: 'Student profile not found',
      error: 'FORBIDDEN',
    });
    return;
  }

  next();
};

/**
 * Resource ownership check middleware factory
 * 
 * Many operations require that the user owns the resource they're
 * trying to access or modify. For example, a student should only
 * be able to view their own test attempts.
 * 
 * This factory creates middleware that extracts a resource ID from
 * the request and checks ownership through a provided checker function.
 * 
 * Usage:
 * ```
 * const checkAttemptOwnership = requireOwnership(
 *   'attemptId',
 *   async (attemptId, user) => {
 *     const attempt = await attemptRepo.findById(attemptId);
 *     return attempt?.StudentProfileID === user.studentProfileId;
 *   }
 * );
 * 
 * router.get('/attempts/:attemptId/results', 
 *   authMiddleware, 
 *   requireStudent,
 *   checkAttemptOwnership,
 *   attemptController.getResults
 * );
 * ```
 * 
 * @param paramName - Name of URL parameter containing resource ID
 * @param ownershipChecker - Async function that checks if user owns resource
 * @returns Middleware function that checks ownership
 */
export const requireOwnership = (
  paramName: string,
  ownershipChecker: (resourceId: number, user: AuthenticatedRequest['user']) => Promise<boolean>
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'UNAUTHORIZED',
        });
        return;
      }

      // Extract resource ID from URL parameters
      const resourceId = parseInt(req.params[paramName]);

      if (isNaN(resourceId)) {
        res.status(400).json({
          success: false,
          message: `Invalid ${paramName}`,
          error: 'INVALID_PARAMETER',
        });
        return;
      }

      // Check ownership using provided checker function
      const isOwner = await ownershipChecker(resourceId, req.user);

      if (!isOwner) {
        // Admins bypass ownership checks (they can access everything)
        if (req.user.role === 'ADMIN') {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          message: 'You do not have permission to access this resource',
          error: 'FORBIDDEN',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify resource ownership',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  };
};

/**
 * Rate limiting check middleware
 * 
 * Prevents abuse by limiting how many requests a user can make
 * in a given time window. Important for preventing spam and DOS attacks.
 * 
 * This is a simple implementation that tracks request counts in memory.
 * In production with multiple servers, you'd use Redis or similar.
 * 
 * Usage:
 * ```
 * router.post('/comments', 
 *   authMiddleware, 
 *   rateLimitByUser(5, 60000), // Max 5 requests per minute
 *   commentController.create
 * );
 * ```
 * 
 * @param maxRequests - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Middleware function that enforces rate limit
 */
export const rateLimitByUser = (maxRequests: number, windowMs: number) => {
  // Store: userId -> { count, resetTime }
  const requestCounts = new Map<number, { count: number; resetTime: number }>();

  // Cleanup old entries periodically to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of requestCounts.entries()) {
      if (data.resetTime < now) {
        requestCounts.delete(userId);
      }
    }
  }, windowMs);

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // If not authenticated, we can't rate limit by user
      // You might want global rate limiting for unauthenticated requests
      next();
      return;
    }

    const userId = req.user.userId;
    const now = Date.now();
    const userLimit = requestCounts.get(userId);

    if (!userLimit || userLimit.resetTime < now) {
      // First request or window expired, reset counter
      requestCounts.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (userLimit.count >= maxRequests) {
      // Limit exceeded
      const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
      
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    // Increment counter and continue
    userLimit.count++;
    next();
  };
};

/**
 * IP-based rate limiting middleware
 * 
 * Similar to user-based rate limiting, but works for unauthenticated
 * requests by tracking IP addresses.
 * 
 * Useful for protecting public endpoints like registration or login.
 * 
 * Note: Be careful with IP-based limiting if behind proxies or load balancers.
 * You may need to use X-Forwarded-For header.
 * 
 * @param maxRequests - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Middleware function that enforces rate limit
 */
export const rateLimitByIP = (maxRequests: number, windowMs: number) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
      if (data.resetTime < now) {
        requestCounts.delete(ip);
      }
    }
  }, windowMs);

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Get IP address (handles proxy scenarios)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
               req.socket.remoteAddress || 
               'unknown';

    const now = Date.now();
    const ipLimit = requestCounts.get(ip);

    if (!ipLimit || ipLimit.resetTime < now) {
      requestCounts.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (ipLimit.count >= maxRequests) {
      const retryAfter = Math.ceil((ipLimit.resetTime - now) / 1000);
      
      res.status(429).json({
        success: false,
        message: 'Too many requests from this IP. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    ipLimit.count++;
    next();
  };
};