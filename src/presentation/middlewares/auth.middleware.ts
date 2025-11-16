import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Extended Request interface to include authenticated user information
 * 
 * When a request is authenticated, we attach user information to the request
 * object so downstream handlers (controllers, other middlewares) can access it.
 * 
 * This pattern is standard in Express applications. By extending the Request
 * interface, TypeScript knows about these additional properties and provides
 * type safety and autocomplete.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    role: string;
    studentProfileId?: number;
    teacherProfileId?: number;
  };
}

/**
 * JWT Payload interface
 * 
 * This defines the structure of data stored in the JWT token.
 * This MUST match the payload structure used by the Spring Boot
 * learning section backend that issues these tokens.
 * 
 * Coordinate with your teammates to ensure consistency!
 */
interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  studentProfileId?: number;
  teacherProfileId?: number;
  iat?: number; // Issued at timestamp
  exp?: number; // Expiration timestamp
}

/**
 * Authentication Middleware
 * 
 * This middleware extracts and verifies JWT tokens from the Authorization header.
 * It's the gatekeeper that ensures only authenticated users can access protected routes.
 * 
 * How it works:
 * 1. Extract token from Authorization header (format: "Bearer <token>")
 * 2. Verify token signature using the shared JWT secret
 * 3. Decode token to get user information
 * 4. Attach user info to request object
 * 5. Call next() to pass control to next middleware/controller
 * 
 * If any step fails, it returns 401 Unauthorized error immediately.
 * 
 * Security considerations:
 * - The JWT_SECRET environment variable MUST be kept secure
 * - It MUST match the secret used by the Spring Boot backend
 * - Never log or expose tokens in error messages
 * - Always use HTTPS in production to prevent token interception
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Extract the Authorization header
    // Standard format: "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'No authorization header provided',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // Check if header follows "Bearer <token>" format
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Invalid authorization header format. Expected: Bearer <token>',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // Extract the actual token (everything after "Bearer ")
    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // Get the JWT secret from environment variables
    // This MUST match the secret used by Spring Boot backend
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET not configured in environment variables');
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
        error: 'INTERNAL_SERVER_ERROR',
      });
      return;
    }

    // Verify and decode the token
    // jwt.verify() throws an error if:
    // - Signature is invalid (token was tampered with)
    // - Token has expired
    // - Token format is invalid
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // Validate that decoded token contains required fields
    if (!decoded.userId || !decoded.email || !decoded.role) {
      res.status(401).json({
        success: false,
        message: 'Invalid token payload',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // Attach user information to request object
    // This makes user info available to all downstream handlers
    // Controllers can now access req.user to know who made the request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      studentProfileId: decoded.studentProfileId,
      teacherProfileId: decoded.teacherProfileId,
    };

    // Log successful authentication (useful for debugging and monitoring)
    // In production, you might want more sophisticated logging
    console.log(`Authenticated user: ${decoded.email} (role: ${decoded.role})`);

    // Pass control to next middleware or controller
    next();
  } catch (error) {
    // Handle JWT verification errors
    // Different errors provide different information about what went wrong
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token has expired',
        error: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: 'INVALID_TOKEN',
      });
      return;
    }

    // Unexpected error during authentication
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * Optional authentication middleware
 * 
 * This is a variant that doesn't require authentication but will attach
 * user info if a valid token is provided. Useful for routes that work
 * differently for authenticated vs anonymous users.
 * 
 * Example: A public exam list might show more details to authenticated users.
 * 
 * If token is present and valid, attaches user info and continues.
 * If token is missing or invalid, just continues without user info.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const optionalAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    // If no auth header, just continue without user info
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      // Even for optional auth, misconfiguration is a server error
      console.error('CRITICAL: JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
        error: 'INTERNAL_SERVER_ERROR',
      });
      return;
    }

    // Try to verify token, but don't fail if it's invalid
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    if (decoded.userId && decoded.email && decoded.role) {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        studentProfileId: decoded.studentProfileId,
        teacherProfileId: decoded.teacherProfileId,
      };
    }

    next();
  } catch (error) {
    // For optional auth, invalid tokens are not errors
    // Just continue without attaching user info
    next();
  }
};

/**
 * Helper function to extract studentProfileId from authenticated request
 * 
 * Many service methods need the studentProfileId. This helper provides
 * a clean way to extract it with proper error handling.
 * 
 * Usage in controllers:
 * ```
 * const studentProfileId = getStudentProfileId(req);
 * const result = await attemptService.startAttempt(data, studentProfileId);
 * ```
 * 
 * @param req - Authenticated request object
 * @returns Student profile ID
 * @throws Error if user is not authenticated or not a student
 */
export const getStudentProfileId = (req: AuthenticatedRequest): number => {
  if (!req.user) {
    throw new Error('User not authenticated');
  }

  if (!req.user.studentProfileId) {
    throw new Error('User is not a student');
  }

  return req.user.studentProfileId;
};

/**
 * Helper function to check if user is authenticated
 * 
 * Simple boolean check for whether request has authenticated user.
 * Useful in routes that use optionalAuthMiddleware.
 * 
 * @param req - Request object (possibly authenticated)
 * @returns True if user is authenticated
 */
export const isAuthenticated = (req: AuthenticatedRequest): boolean => {
  return !!req.user;
};

/**
 * Helper function to check user role
 * 
 * Provides clean way to check if authenticated user has specific role.
 * Used in authorization checks throughout controllers.
 * 
 * @param req - Authenticated request object
 * @param role - Role to check for (e.g., 'ADMIN', 'TEACHER', 'STUDENT')
 * @returns True if user has the specified role
 */
export const hasRole = (req: AuthenticatedRequest, role: string): boolean => {
  return req.user?.role === role;
};