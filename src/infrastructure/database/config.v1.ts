import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * TypeORM DataSource configuration
 * This configuration is used for both runtime and CLI operations (migrations, etc.)
 * 
 * Key points:
 * - We use MySQL2 driver for better performance and TypeScript support
 * - Entities are loaded from the entities directory
 * - Migrations are stored separately for better organization
 * - Logging is enabled in development for debugging
 * - synchronize is set to false for production safety (use migrations instead)
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'db_doantotnghiep',
  
  // Entity loading configuration
  entities: [__dirname + '/../../domain/entities/*.entity{.ts,.js}'],
  
  // Migration configuration
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  
  // Development vs Production settings
  synchronize: false, // Never use true in production! Use migrations instead
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn', 'query'] : ['error'],
  
  // Connection pool settings for better performance
  extra: {
    connectionLimit: 10,
  },
  
  // Character set configuration for Vietnamese text support
  charset: 'utf8mb4',
});

/**
 * Initialize database connection
 * This function should be called when the application starts
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};

/**
 * Close database connection
 * This function should be called when the application shuts down gracefully
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.destroy();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
};

