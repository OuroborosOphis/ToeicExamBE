import { Request, Response, NextFunction } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Custom Error Classes
 * 
 * These custom error classes allow services to throw specific types of errors
 * that carry semantic meaning. The error handling middleware can then respond
 * appropriately based on error type.
 * 
 * For example, NotFoundError always results in 404 status code, while
 * ValidationError results in 400. This makes error handling consistent
 * across the entire application.
 */

/**
 * Base Application Error
 * 
 * All custom errors extend this base class, which extends the built-in Error.
 * This allows us to distinguish our intentional errors from unexpected errors.
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errorCode: string = 'INTERNAL_SERVER_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not Found Error (404)
 * 
 * Thrown when a requested resource doesn't exist.
 * Example: Student tries to view exam ID 999 but it doesn't exist.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Validation Error (400)
 * 
 * Thrown when business validation fails.
 * Different from DTO validation - this is for business rules.
 * Example: Student tries to submit exam after time limit.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authorization Error (403)
 * 
 * Thrown when user doesn't have permission for an action.
 * Example: Student tries to delete another student's attempt.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Conflict Error (409)
 * 
 * Thrown when operation conflicts with current state.
 * Example: Trying to submit an attempt that's already submitted.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Bad Request Error (400)
 * 
 * Generic bad request error for malformed or invalid requests.
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * Global Error Handling Middleware
 * 
 * This is THE error handler for the entire application.
 * It's the last middleware in the chain and catches any errors
 * that weren't handled by earlier middlewares or controllers.
 * 
 * How Express error handling works:
 * - When any middleware or controller throws an error (or calls next(error)),
 *   Express skips all remaining normal middleware
 * - Express then looks for error-handling middleware (has 4 parameters)
 * - This middleware gets called with the error
 * 
 * This middleware:
 * 1. Categorizes the error (custom app error vs unexpected error)
 * 2. Logs the error appropriately
 * 3. Formats a consistent error response
 * 4. Sends appropriate HTTP status code
 * 
 * IMPORTANT: This middleware must be registered LAST in your middleware chain.
 * 
 * @param error - The error that was thrown or passed to next()
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next function (required for Express to recognize this as error handler)
 */
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error for debugging and monitoring
  // In production, you'd send this to a logging service like Sentry or CloudWatch
  console.error('Error occurred:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    user: (req as any).user?.email,
  });

  // Handle our custom AppError instances
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.errorCode,
      details: error.details,
      // Include stack trace in development only
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
    return;
  }

  // Handle TypeORM database errors
  if (error instanceof QueryFailedError) {
    handleDatabaseError(error as any, res);
    return;
  }

  // Handle unexpected errors
  // These are bugs that need to be fixed - log them prominently
  console.error('UNEXPECTED ERROR:', error);

  // Don't expose internal error details to client in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : error.message;

  res.status(500).json({
    success: false,
    message,
    error: 'INTERNAL_SERVER_ERROR',
    // Only include stack in development
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

/**
 * Handle database-specific errors
 * 
 * TypeORM and MySQL throw various errors that have specific meanings.
 * This function translates database errors into user-friendly messages.
 * 
 * Common database errors:
 * - Duplicate key (trying to insert duplicate email)
 * - Foreign key constraint (trying to reference non-existent entity)
 * - Not null violation (missing required field)
 * - Connection errors (database is down)
 * 
 * @param error - TypeORM QueryFailedError
 * @param res - Express response object
 */
function handleDatabaseError(error: any, res: Response): void {
  // MySQL error codes
  const mysqlErrorCode = error.errno || error.code;

  switch (mysqlErrorCode) {
    case 1062: // ER_DUP_ENTRY - Duplicate key
      res.status(409).json({
        success: false,
        message: 'Duplicate entry. This record already exists.',
        error: 'DUPLICATE_ENTRY',
        details: parseDuplicateKeyError(error.message),
      });
      break;

    case 1452: // ER_NO_REFERENCED_ROW_2 - Foreign key constraint
      res.status(400).json({
        success: false,
        message: 'Referenced record does not exist.',
        error: 'FOREIGN_KEY_CONSTRAINT',
        details: error.message,
      });
      break;

    case 1048: // ER_BAD_NULL_ERROR - NOT NULL constraint
      res.status(400).json({
        success: false,
        message: 'Required field is missing.',
        error: 'NOT_NULL_CONSTRAINT',
        details: error.message,
      });
      break;

    case 1364: // ER_NO_DEFAULT_FOR_FIELD - Column has no default value
      res.status(400).json({
        success: false,
        message: 'Required field is missing.',
        error: 'MISSING_REQUIRED_FIELD',
        details: error.message,
      });
      break;

    case 'ECONNREFUSED': // Connection refused
      console.error('DATABASE CONNECTION REFUSED - Database may be down');
      res.status(503).json({
        success: false,
        message: 'Database connection error. Please try again later.',
        error: 'DATABASE_CONNECTION_ERROR',
      });
      break;

    case 'ETIMEDOUT': // Connection timeout
      console.error('DATABASE CONNECTION TIMEOUT');
      res.status(503).json({
        success: false,
        message: 'Database connection timeout. Please try again later.',
        error: 'DATABASE_TIMEOUT',
      });
      break;

    default:
      // Unknown database error
      console.error('Unhandled database error:', error);
      res.status(500).json({
        success: false,
        message: 'A database error occurred.',
        error: 'DATABASE_ERROR',
        ...(process.env.NODE_ENV === 'development' && {
          details: error.message,
        }),
      });
  }
}

/**
 * Parse duplicate key error message
 * 
 * MySQL duplicate key errors contain which field caused the duplicate.
 * This function extracts that information for clearer error messages.
 * 
 * Example error message:
 * "Duplicate entry 'test@example.com' for key 'users.email'"
 * 
 * Parsed result:
 * { field: 'email', value: 'test@example.com' }
 * 
 * @param errorMessage - MySQL error message
 * @returns Parsed duplicate key information
 */
function parseDuplicateKeyError(errorMessage: string): any {
  const match = errorMessage.match(/Duplicate entry '(.+)' for key '(.+)'/);
  
  if (match) {
    return {
      value: match[1],
      field: match[2].split('.').pop(), // Get field name after table name
    };
  }

  return { message: errorMessage };
}

/**
 * Not Found Route Handler
 * 
 * This middleware handles requests to routes that don't exist.
 * It should be registered after all your real routes but before
 * the error handler.
 * 
 * Example: Client requests GET /api/exam/nonexistent
 * This handler catches it and returns 404.
 * 
 * @param req - Express request object
 * @param res - Express response object
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
    error: 'ROUTE_NOT_FOUND',
  });
};

/**
 * Async Handler Wrapper
 * 
 * Express doesn't handle rejected promises well by default.
 * If an async controller function throws an error, Express might not
 * catch it properly.
 * 
 * This wrapper ensures errors from async functions are passed to
 * the error handler middleware.
 * 
 * Usage in routes:
 * ```
 * router.get('/exams/:id', asyncHandler(async (req, res) => {
 *   const exam = await examService.getExamById(req.params.id);
 *   res.json({ success: true, data: exam });
 * }));
 * ```
 * 
 * Or in controllers:
 * ```
 * class ExamController {
 *   getById = asyncHandler(async (req, res) => {
 *     // async code here
 *   });
 * }
 * ```
 * 
 * @param fn - Async function to wrap
 * @returns Wrapped function that catches errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Development Error Logger
 * 
 * In development, it's helpful to see detailed error information.
 * This middleware logs errors with full stack traces.
 * 
 * Register this before your error handler in development:
 * ```
 * if (process.env.NODE_ENV === 'development') {
 *   app.use(developmentErrorLogger);
 * }
 * app.use(errorHandler);
 * ```
 * 
 * @param error - The error
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next function
 */
export const developmentErrorLogger = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.log('\n========== ERROR DETAILS ==========');
  console.log('Time:', new Date().toISOString());
  console.log('Request:', req.method, req.url);
  console.log('Error Name:', error.name);
  console.log('Error Message:', error.message);
  console.log('Stack Trace:');
  console.log(error.stack);
  console.log('=====================================\n');
  
  // Pass error to next error handler
  next(error);
};

/**
 * Request Timeout Handler
 * 
 * Middleware that sets a timeout for each request.
 * If a request takes too long (maybe due to slow database or infinite loop),
 * this middleware will terminate it.
 * 
 * Usage:
 * ```
 * app.use(requestTimeout(30000)); // 30 second timeout
 * ```
 * 
 * @param ms - Timeout in milliseconds
 * @returns Middleware function
 */
export const requestTimeout = (ms: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout on request
    req.setTimeout(ms, () => {
      res.status(408).json({
        success: false,
        message: 'Request timeout',
        error: 'REQUEST_TIMEOUT',
      });
    });

    next();
  };
};