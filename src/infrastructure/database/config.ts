import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Tự động tạo database nếu chưa tồn tại
 */
async function ensureDatabaseExists(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  const dbName = process.env.DB_DATABASE || 'db_doantotnghiep';
  
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  
  console.log(`✅ Database '${dbName}' is ready`);
  await connection.end();
}

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'db_doantotnghiep',
  
  // TỰ ĐỘNG TẠO/CẬP NHẬT BẢNG từ entities
  synchronize: process.env.NODE_ENV !== 'production', // true cho dev, false cho production
  
  logging: process.env.NODE_ENV !== 'production',
  
  entities: [path.join(__dirname, '../../domain/entities/**/*.entity{.ts,.js}')],
  
  migrations: [path.join(__dirname, './migrations/**/*{.ts,.js}')],
  
  subscribers: [],
  
  charset: 'utf8mb4',
  timezone: '+07:00',
});

/**
 * Initialize database connection
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    // Bước 1: Tạo database nếu chưa có
    await ensureDatabaseExists();
    
    // Bước 2: Kết nối và tự động tạo/cập nhật bảng
    await AppDataSource.initialize();
    console.log('✅ Database connection established successfully');
    console.log('✅ Tables synchronized automatically');
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
    throw error;
  }
};

/**
 * Close database connection
 */
export const closeDatabase = async (): Promise<void> => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('Database connection closed');
  }
};