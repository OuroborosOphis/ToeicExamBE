import 'reflect-metadata'; // Required for TypeORM decorators
import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './infrastructure/database/config';
import {
  errorHandler,
  notFoundHandler,
  developmentErrorLogger,
  requestTimeout,
} from './presentation/middlewares/error.middleware';

// Import route modules
import examRoutes from './presentation/routes/exam.routes';
import attemptRoutes from './presentation/routes/attempt.routes';
import questionRoutes from './presentation/routes/question.routes';
import commentRoutes from './presentation/routes/comment.routes';
import mediaGroupRoutes from './presentation/routes/media-group.routes';
import examTypeRoutes from './presentation/routes/exam-types.routes';
import uploadRoutes from './presentation/routes/upload.route';
import path from 'path/win32';

/**
 * TOEIC Exam Practice Backend Server
 * 
 * This is the main entry point for the backend API. It:
 * 1. Loads environment configuration
 * 2. Initializes database connection
 * 3. Configures Express application
 * 4. Registers middlewares in correct order
 * 5. Registers all routes
 * 6. Sets up error handling
 * 7. Starts the HTTP server
 * 8. Handles graceful shutdown
 * 
 * The order of middleware registration is critical and follows this pattern:
 * - Global middlewares (parsing, CORS, logging)
 * - Route-specific middlewares (defined in route files)
 * - 404 handler for undefined routes
 * - Global error handler (must be last)
 */

// Load environment variables from .env file
dotenv.config();

// Environment configuration with defaults
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_PREFIX = process.env.API_PREFIX || '/api/exam';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

/**
 * Create and configure Express application
 * 
 * This function sets up all the middleware, routes, and error handling
 * for the Express app. It's separated into a function to make testing easier
 * and to keep the server startup logic clean.
 */
function createApp(): Application {
  const app = express();

  // ============================================================
  // GLOBAL MIDDLEWARES
  // These run for every request before routing
  // ============================================================

  /**
   * Request timeout middleware
   * 
   * Sets a 30-second timeout for all requests. If a request takes longer,
   * it will be terminated with a 408 Request Timeout error.
   * 
   * This prevents requests from hanging indefinitely due to slow database
   * queries or infinite loops in business logic.
   */
  app.use(requestTimeout(30000)); // 30 seconds

  /**
   * Body parser middlewares
   * 
   * These parse incoming request bodies in various formats:
   * - express.json(): Parses JSON bodies (most common for APIs)
   * - express.urlencoded(): Parses URL-encoded bodies (from forms)
   * 
   * The limit option prevents excessively large payloads that could
   * cause memory issues or DOS attacks.
   */
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  /**
   * CORS middleware
   * 
   * Configures Cross-Origin Resource Sharing to allow requests from
   * the frontend application. This is necessary because the frontend
   * and backend run on different ports during development.
   * 
   * In production, CORS_ORIGIN should be set to your actual frontend domain.
   * 
   * Key CORS options:
   * - origin: Which domains can make requests
   * - credentials: Allow cookies/auth headers
   * - methods: Which HTTP methods are allowed
   * - allowedHeaders: Which headers can be sent
   */
  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  /**
   * Request logging middleware
   * 
   * Logs every incoming request with method, URL, and timestamp.
   * In production, you'd use a proper logging library like Winston
   * and send logs to a logging service.
   * 
   * This is basic console logging for development and debugging.
   */
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
  });

  // ============================================================
  // HEALTH CHECK ENDPOINT
  // ============================================================

  /**
   * Health check endpoint
   * 
   * GET /health or GET /api/exam/health
   * 
   * Returns a simple status to verify the server is running.
   * Load balancers and monitoring tools use this to check server health.
   * 
   * In production, you might want to check database connectivity and
   * other dependencies before returning healthy status.
   */
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
    });
  });

  // Also expose health check under API prefix
  app.get(`${API_PREFIX}/health`, (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
    });
  });

  // ============================================================
  // STATIC FILE SERVING
  // Serve uploaded files as static assets
  // ============================================================
  
  /**
   * Static file middleware để serve uploaded files
   * 
   * Khi frontend request http://localhost:3001/uploads/audio/file.mp3,
   * Express sẽ serve file từ thư mục uploads/audio/
   * 
   * QUAN TRỌNG:
   * - Middleware này phải đứng TRƯỚC các API routes
   * - Nếu để sau routes, Express sẽ check routes trước và không bao giờ
   *   đến được static file middleware
   */
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  console.log('📁 Serving static files from /uploads');

  // ============================================================
  // API ROUTES
  // All routes are prefixed with API_PREFIX (default: /api/exam)
  // ============================================================

  /**
   * Register route modules
   * 
   * Each route module handles a specific domain:
   * - /exams: Exam management (create, read, update, delete exams)
   * - /attempts: Test-taking (start, submit, view results)
   * - /questions: Question bank management
   * - /comments: Discussion and social features
   * 
   * Routes are mounted under the API prefix for clear namespacing.
   * This makes it easy to version the API later (e.g., /api/v2/exam)
   */

  // Upload routes - Add this BEFORE other routes
  app.use(`${API_PREFIX}/upload`, uploadRoutes);
  // Media group routes - Must come before exam routes to avoid conflicts
  app.use(`${API_PREFIX}/media-groups`, mediaGroupRoutes);
  app.use(`${API_PREFIX}/exams`, examRoutes);
  app.use(`${API_PREFIX}/exam-types`, examTypeRoutes);
  app.use(`${API_PREFIX}/attempts`, attemptRoutes);
  app.use(`${API_PREFIX}/questions`, questionRoutes);
  app.use(`${API_PREFIX}/comments`, commentRoutes);

  /**
   * Root API endpoint
   * 
   * Provides information about the API when accessing the root URL.
   * Useful for developers exploring the API.
   */
  app.get(API_PREFIX, (req, res) => {
    res.status(200).json({
      message: 'TOEIC Exam Practice API',
      version: '1.0.0',
      endpoints: {
        exams: `${API_PREFIX}/exams`,
        examTypes: `${API_PREFIX}/exam-types`,
        attempts: `${API_PREFIX}/attempts`,
        questions: `${API_PREFIX}/questions`,
        comments: `${API_PREFIX}/comments`,
        mediaGroups: `${API_PREFIX}/media-groups`,
      },
      documentation: `${API_PREFIX}/docs`, // Swagger docs when implemented
    });
  });

  // ============================================================
  // ERROR HANDLING
  // These must come after all routes
  // ============================================================

  /**
   * Development error logger
   * 
   * In development mode, log detailed error information to console.
   * This helps with debugging but should not run in production as it
   * could expose sensitive information.
   */
  if (NODE_ENV === 'development') {
    app.use(developmentErrorLogger);
  }

  /**
   * 404 Not Found handler
   * 
   * Catches requests to routes that don't exist.
   * This must come after all route definitions but before error handler.
   * 
   * Returns a consistent JSON error response instead of HTML 404 page.
   */
  app.use(notFoundHandler);

  /**
   * Global error handler
   * 
   * This MUST be the last middleware registered.
   * It catches all errors from routes and middlewares and formats them
   * into consistent error responses.
   * 
   * Express recognizes this as an error handler because it has 4 parameters.
   */
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 * 
 * This async function:
 * 1. Initializes database connection
 * 2. Creates Express app
 * 3. Starts HTTP server
 * 4. Sets up graceful shutdown handlers
 * 
 * It's separated from the app creation for testability and to handle
 * async operations (like database initialization) properly.
 */
async function startServer(): Promise<void> {
  try {
    // Initialize database connection
    console.log('🔄 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database connected successfully');

    // Create Express application
    const app = createApp();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('=================================================');
      console.log(`🚀 Server running in ${NODE_ENV} mode`);
      console.log(`📡 Port: ${PORT}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}${API_PREFIX}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log('=================================================');
      console.log('');
      console.log('Available endpoints:');
      console.log(`  - Exams: ${API_PREFIX}/exams`);
      console.log(`  - Attempts: ${API_PREFIX}/attempts`);
      console.log(`  - Questions: ${API_PREFIX}/questions`);
      console.log(`  - Comments: ${API_PREFIX}/comments`);
      console.log(`  - Media Groups: ${API_PREFIX}/media-groups`);
      console.log('');
      console.log('Press CTRL+C to stop the server');
      console.log('');
    });

    /**
     * Graceful shutdown handler
     * 
     * When the process receives a shutdown signal (SIGTERM or SIGINT),
     * we want to gracefully shutdown:
     * 1. Stop accepting new requests
     * 2. Finish processing ongoing requests
     * 3. Close database connections
     * 4. Exit process
     * 
     * This prevents data corruption and ensures clean shutdown.
     */
    const gracefulShutdown = async (signal: string) => {
      console.log('');
      console.log(`\n📴 ${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        console.log('🔌 HTTP server closed');

        try {
          // Close database connection
          await closeDatabase();
          console.log('💾 Database connection closed');

          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds if graceful shutdown hangs
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after 30 seconds timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers for different signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    /**
     * Unhandled rejection handler
     * 
     * Catches unhandled promise rejections that weren't caught elsewhere.
     * These are bugs that need to be fixed, so log them prominently.
     */
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Promise Rejection:');
      console.error('Reason:', reason);
      console.error('Promise:', promise);
      // In production, you might want to send this to error tracking service
    });

    /**
     * Uncaught exception handler
     * 
     * Catches synchronous errors that weren't caught elsewhere.
     * These are serious errors that might leave the app in unstable state.
     */
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:');
      console.error(error);
      // Exit process as app state might be corrupted
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
// (not imported as a module for testing)
if (require.main === module) {
  startServer();
}

// Export for testing purposes
export { createApp, startServer };