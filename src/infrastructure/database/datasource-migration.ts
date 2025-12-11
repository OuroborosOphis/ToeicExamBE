import { DataSource } from "typeorm";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// IMPORTANT: Chỉ export 1 DataSource duy nhất để CLI dùng
export const MigrationDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  username: process.env.DB_USERNAME || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "db_doantotnghiep",

  // Không dùng synchronize khi chạy migration
  synchronize: false,
  logging: false,

  // Load entities
  entities: [
    path.join(__dirname, "../../domain/entities/**/*{.ts,.js}")
  ],

  // Load migration files
  migrations: [
    path.join(__dirname, "./migrations/**/*{.ts,.js}")
  ],

  charset: "utf8mb4",
  timezone: "+07:00",
});
