import { Request, Response, NextFunction } from 'express';
import { validate, ValidationError } from 'class-validator';
import { plainToClass, ClassConstructor } from 'class-transformer';

/**
 * Validation Middleware Factory
 * 
 * This middleware automatically validates request data against DTO schemas
 * using class-validator decorators. It's a critical layer that ensures
 * only valid, well-formed data reaches your services.
 * 
 * The validation happens before any business logic runs, catching problems
 * early and providing clear feedback about what's wrong with the request.
 * 
 * How it works:
 * 1. Transform plain JSON from request into DTO class instance
 * 2. Run class-validator validation on the instance
 * 3. If validation fails, return 400 with detailed errors
 * 4. If validation passes, attach validated DTO to request and continue
 * 
 * This pattern eliminates manual validation code in controllers and
 * ensures consistent validation across all endpoints.
 */

/**
 * Validate request body middleware factory
 * 
 * Creates middleware that validates request body against a specific DTO class.
 * The DTO class should use class-validator decorators like @IsString(),
 * @IsInt(), @IsNotEmpty(), etc.
 * 
 * Usage in routes:
 * ```
 * import { CreateExamDto } from '../dtos/exam.dto';
 * 
 * router.post('/exams',
 *   authMiddleware,
 *   validateBody(CreateExamDto),
 *   examController.create
 * );
 * ```
 * 
 * The validated and transformed DTO will be available as req.body,
 * but now TypeScript knows it's a CreateExamDto with all validations passed.
 * 
 * @param dtoClass - The DTO class to validate against
 * @param skipMissingProperties - Whether to skip validation of undefined properties
 * @returns Middleware function that performs validation
 */
export const validateBody = (dtoClass: any, skipMissingProperties = false) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Transform plain JSON object to DTO class instance
      // This is necessary for class-validator to work properly
      // The transformation also applies any @Transform() decorators
      const dtoInstance = plainToClass(dtoClass, req.body);

      // Validate the DTO instance
      // This runs all the validation decorators (@IsString, @IsEmail, etc.)
      const errors = await validate(dtoInstance, {
        skipMissingProperties,
        whitelist: true, // Strip properties that aren't in DTO
        forbidNonWhitelisted: true, // Reject if extra properties present
      });

      if (errors.length > 0) {
        // Validation failed - format errors nicely for client
        const formattedErrors = formatValidationErrors(errors);
        
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          error: 'VALIDATION_ERROR',
          details: formattedErrors,
        });
        return;
      }

      // Validation passed - replace req.body with validated DTO instance
      // Controllers now get a properly typed and validated object
      req.body = dtoInstance;
      
      next();
    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Validation processing failed',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  };
};

/**
 * Validate query parameters middleware factory
 * 
 * Similar to validateBody but for URL query parameters.
 * Useful for validating filter and pagination parameters.
 * 
 * Usage:
 * ```
 * import { QuestionFilterDto } from '../dtos/question.dto';
 * 
 * router.get('/questions',
 *   authMiddleware,
 *   validateQuery(QuestionFilterDto),
 *   questionController.search
 * );
 * ```
 * 
 * Query params come as strings, so the DTO should use @Type() decorators
 * to convert them to proper types:
 * ```
 * @Type(() => Number)
 * @IsInt()
 * Page?: number;
 * ```
 * 
 * @param dtoClass - The DTO class to validate against
 * @returns Middleware function that performs validation
 */
export const validateQuery = <T extends object>(dtoClass: ClassConstructor<T>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Transform query parameters to DTO instance
      // Query params are always strings, so transformation is critical
      const dtoInstance = plainToClass(dtoClass, req.query);

      const errors = await validate(dtoInstance, {
        skipMissingProperties: true, // Query params are usually optional
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const formattedErrors = formatValidationErrors(errors);
        
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          error: 'VALIDATION_ERROR',
          details: formattedErrors,
        });
        return;
      }

      // Replace req.query with validated DTO
      req.query = dtoInstance as any;
      
      next();
    } catch (error) {
      console.error('Query validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Query validation processing failed',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  };
};

/**
 * Validate route parameters middleware factory
 * 
 * Validates URL path parameters (like :id in /exams/:id).
 * Less commonly needed since path params are usually simple,
 * but useful for ensuring IDs are valid integers, etc.
 * 
 * Usage:
 * ```
 * class ExamIdParam {
 *   @Type(() => Number)
 *   @IsInt()
 *   @Min(1)
 *   id: number;
 * }
 * 
 * router.get('/exams/:id',
 *   authMiddleware,
 *   validateParams(ExamIdParam),
 *   examController.getById
 * );
 * ```
 * 
 * @param dtoClass - The DTO class to validate against
 * @returns Middleware function that performs validation
 */
export const validateParams = <T extends object>(dtoClass: ClassConstructor<T>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dtoInstance = plainToClass(dtoClass, req.params);

      const errors = await validate(dtoInstance, {
        skipMissingProperties: false, // Path params should all be present
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const formattedErrors = formatValidationErrors(errors);
        
        res.status(400).json({
          success: false,
          message: 'Invalid route parameters',
          error: 'VALIDATION_ERROR',
          details: formattedErrors,
        });
        return;
      }

      req.params = dtoInstance as any;
      
      next();
    } catch (error) {
      console.error('Params validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Parameter validation processing failed',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  };
};

/**
 * Format validation errors for client-friendly response
 * 
 * class-validator returns errors in a nested structure that can be
 * hard to parse. This function flattens them into a clear array
 * of field-error pairs.
 * 
 * Input (class-validator error):
 * ```
 * [
 *   {
 *     property: 'email',
 *     constraints: { isEmail: 'email must be an email' }
 *   },
 *   {
 *     property: 'age',
 *     constraints: { min: 'age must be at least 18' }
 *   }
 * ]
 * ```
 * 
 * Output (formatted for client):
 * ```
 * [
 *   { field: 'email', message: 'email must be an email' },
 *   { field: 'age', message: 'age must be at least 18' }
 * ]
 * ```
 * 
 * This format is much easier for frontend to display to users.
 * 
 * @param errors - Array of ValidationError objects from class-validator
 * @returns Array of formatted error objects
 */
function formatValidationErrors(
  errors: ValidationError[]
): Array<{ field: string; message: string; constraints?: any }> {
  const formatted: Array<{ field: string; message: string; constraints?: any }> = [];

  errors.forEach((error) => {
    // Handle nested validation errors (e.g., validating array elements)
    if (error.children && error.children.length > 0) {
      const childErrors = formatValidationErrors(error.children);
      childErrors.forEach((childError) => {
        formatted.push({
          field: `${error.property}.${childError.field}`,
          message: childError.message,
          constraints: childError.constraints,
        });
      });
    } else if (error.constraints) {
      // Get all constraint error messages
      const messages = Object.values(error.constraints);
      
      // Usually we just need the first message, but include all for completeness
      formatted.push({
        field: error.property,
        message: messages[0], // First constraint message
        constraints: error.constraints, // All constraints for debugging
      });
    }
  });

  return formatted;
}

/**
 * Sanitize request body middleware
 * 
 * Removes potentially dangerous content from string fields.
 * Important for preventing XSS attacks and SQL injection.
 * 
 * This is a basic implementation. In production, you'd want more
 * sophisticated sanitization using libraries like DOMPurify or similar.
 * 
 * Usage:
 * ```
 * router.post('/comments',
 *   authMiddleware,
 *   sanitizeBody,  // Sanitize before validation
 *   validateBody(CreateCommentDto),
 *   commentController.create
 * );
 * ```
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Function to pass control to next middleware
 */
export const sanitizeBody = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Recursively sanitize an object
 * 
 * Walks through all properties of an object and sanitizes string values.
 * Handles nested objects and arrays.
 * 
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize a string value
 * 
 * Removes or escapes potentially dangerous characters and patterns.
 * This is a basic implementation - enhance based on your security needs.
 * 
 * @param str - String to sanitize
 * @returns Sanitized string
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;

  // Trim whitespace
  let sanitized = str.trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Escape HTML special characters to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Content length validator middleware
 * 
 * Prevents excessively large request bodies that could cause
 * denial of service or memory issues.
 * 
 * Express has built-in body size limits, but this provides an
 * additional check with custom error messages.
 * 
 * Usage:
 * ```
 * router.post('/upload',
 *   authMiddleware,
 *   validateContentLength(5 * 1024 * 1024), // Max 5MB
 *   uploadController.handle
 * );
 * ```
 * 
 * @param maxBytes - Maximum allowed content length in bytes
 * @returns Middleware function that checks content length
 */
export const validateContentLength = (maxBytes: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > maxBytes) {
      res.status(413).json({
        success: false,
        message: `Request body too large. Maximum size: ${maxBytes} bytes`,
        error: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }

    next();
  };
};

/**
 * File upload validation middleware
 * 
 * Validates uploaded files (when using multer or similar).
 * Checks file type, size, and count.
 * 
 * Usage:
 * ```
 * router.post('/questions/image',
 *   authMiddleware,
 *   upload.single('image'),
 *   validateFileUpload({
 *     allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
 *     maxSize: 2 * 1024 * 1024, // 2MB
 *   }),
 *   questionController.uploadImage
 * );
 * ```
 * 
 * @param options - Validation options
 * @returns Middleware function that validates uploaded files
 */
export const validateFileUpload = (options: {
  allowedMimeTypes?: string[];
  maxSize?: number;
  maxCount?: number;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file as Express.Multer.File | undefined;

    // Get all files (single or multiple)
    const allFiles: Express.Multer.File[] = [];
    if (file) allFiles.push(file);
    if (files && Array.isArray(files)) allFiles.push(...files);

    if (allFiles.length === 0) {
      // No files uploaded - this might be okay depending on endpoint
      next();
      return;
    }

    // Check file count
    if (options.maxCount && allFiles.length > options.maxCount) {
      res.status(400).json({
        success: false,
        message: `Too many files. Maximum allowed: ${options.maxCount}`,
        error: 'TOO_MANY_FILES',
      });
      return;
    }

    // Validate each file
    for (const uploadedFile of allFiles) {
      // Check MIME type
      if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(uploadedFile.mimetype)) {
        res.status(400).json({
          success: false,
          message: `Invalid file type: ${uploadedFile.mimetype}. Allowed: ${options.allowedMimeTypes.join(', ')}`,
          error: 'INVALID_FILE_TYPE',
        });
        return;
      }

      // Check file size
      if (options.maxSize && uploadedFile.size > options.maxSize) {
        res.status(400).json({
          success: false,
          message: `File too large: ${uploadedFile.size} bytes. Maximum: ${options.maxSize} bytes`,
          error: 'FILE_TOO_LARGE',
        });
        return;
      }
    }

    // All validations passed
    next();
  };
};