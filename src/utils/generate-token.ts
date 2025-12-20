// src/utils/generate-token.ts
/**
 * JWT Token Generator Utility
 * 
 * Script này tạo JWT tokens cho development và testing purposes.
 * Tokens được generate với đúng payload structure mà backend expect.
 * 
 * Usage:
 * 1. Chạy script: npx ts-node src/utils/generate-token.ts
 * 2. Copy token được generate
 * 3. Frontend sử dụng token này trong Authorization header
 * 
 * QUAN TRỌNG:
 * - JWT_SECRET phải giống với Spring Boot backend
 * - Payload structure phải match với interface JwtPayload trong auth.middleware.ts
 * - Expiration time nên match với Spring Boot để behavior giống nhau
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import type { StringValue } from 'ms';  // For the type assertion on expiresIn

// Load environment variables
dotenv.config();

/**
 * Interface định nghĩa cấu trúc payload của JWT token
 * PHẢI MATCH với JwtPayload interface trong auth.middleware.ts
 * và với payload structure mà Spring Boot backend generate
 */
interface TokenPayload {
  userId: number;
  email: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  studentProfileId?: number;
  teacherProfileId?: number;
  iat?: number;  // Issued at - được thêm tự động bởi jwt.sign()
  exp?: number;  // Expiration - được tính từ expiresIn option
}

/**
 * Configuration cho token generation
 * Customize các giá trị này theo nhu cầu testing
 */
const TOKEN_CONFIG = {
  // Secret key PHẢI giống với Spring Boot backend
  // Trong production, cả hai backends phải dùng chung secret này
  secret: process.env.JWT_SECRET || 'your-secret-key-here',
  
  // Expiration time cho access token
  // Nên match với Spring Boot để behavior giống nhau
  // Format: '15m', '1h', '7d', etc.
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  
  // Issuer - identify ai đã issue token này
  // Có thể dùng để distinguish giữa tokens từ các services khác nhau
  issuer: 'com.mxhieu', // Match với Spring Boot issuer
};

/**
 * Generate JWT token với payload được provide
 * 
 * Function này tạo token với:
 * - Payload chứa user information
 * - Signature được tạo bằng SECRET_KEY
 * - Expiration time để token tự động invalid sau một thời gian
 * 
 * @param payload - User information to encode trong token
 * @returns Signed JWT token string
 */
function generateToken(payload: TokenPayload): string {
  // Validate rằng JWT_SECRET đã được set
  if (!TOKEN_CONFIG.secret || TOKEN_CONFIG.secret === 'your-secret-key-here') {
    console.error('⚠️  WARNING: JWT_SECRET not properly configured!');
    console.error('Please set JWT_SECRET in your .env file');
    console.error('This secret MUST match với Spring Boot backend secret');
  }

  // Generate token với jwt.sign()
  // Token sẽ include:
  // - Payload data (userId, email, role, etc.)
  // - iat (issued at) timestamp - added automatically
  // - exp (expiration) timestamp - calculated from expiresIn
  // - iss (issuer) - identify token source
  const token = jwt.sign(
    payload,
    TOKEN_CONFIG.secret,
    {
      expiresIn: TOKEN_CONFIG.expiresIn as StringValue,
      issuer: TOKEN_CONFIG.issuer,
    }
  );

  return token;
}

/**
 * Generate token cho Admin user
 * 
 * Admin có full access đến tất cả resources
 * Không cần studentProfileId hay teacherProfileId
 */
function generateAdminToken(): string {
  const payload: TokenPayload = {
    userId: 1,
    email: 'admin@toeic-practice.com',
    role: 'ADMIN',
  };

  return generateToken(payload);
}

/**
 * Generate token cho Teacher user
 * 
 * Teacher có quyền tạo và quản lý exams, questions
 * Có teacherProfileId để link với teacher-specific data
 */
function generateTeacherToken(): string {
  const payload: TokenPayload = {
    userId: 2,
    email: 'teacher@toeic-practice.com',
    role: 'TEACHER',
    teacherProfileId: 1,
  };

  return generateToken(payload);
}

/**
 * Generate token cho Student user
 * 
 * Student có quyền làm bài thi, xem kết quả của mình
 * Cần studentProfileId để link với student-specific data
 * (attempts, progress, comments, etc.)
 */
function generateStudentToken(studentId: number = 14): string {
  const payload: TokenPayload = {
    userId: 43,
    // userId: studentId + 2, // userIds start from 3 for students
    email: `student${studentId}@toeic-practice.com`,
    role: 'STUDENT',
    studentProfileId: 14,
  };

  return generateToken(payload);
}

/**
 * Generate token với custom payload
 * 
 * Useful khi cần test specific scenarios với custom data
 * 
 * @param customPayload - Custom token payload
 * @returns Generated token
 */
function generateCustomToken(customPayload: Partial<TokenPayload>): string {
  // Merge custom payload với default values
  const payload: TokenPayload = {
    userId: customPayload.userId || 999,
    email: customPayload.email || 'custom@toeic-practice.com',
    role: customPayload.role || 'STUDENT',
    studentProfileId: customPayload.studentProfileId,
    teacherProfileId: customPayload.teacherProfileId,
  };

  return generateToken(payload);
}

/**
 * Decode và display token information
 * 
 * Useful để verify token content và check expiration
 * 
 * @param token - JWT token to decode
 */
function decodeToken(token: string): void {
  try {
    // Decode without verification (just read the payload)
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      console.error('❌ Invalid token format');
      return;
    }

    console.log('\n📋 Token Information:');
    console.log('Header:', JSON.stringify(decoded.header, null, 2));
    console.log('Payload:', JSON.stringify(decoded.payload, null, 2));
    
    // Check expiration
    const payload = decoded.payload as any;
    if (payload.exp) {
      const expiresAt = new Date(payload.exp * 1000);
      const now = new Date();
      const isExpired = expiresAt < now;
      
      console.log('\n⏰ Expiration:');
      console.log(`Expires at: ${expiresAt.toISOString()}`);
      console.log(`Status: ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      
      if (!isExpired) {
        const timeLeft = expiresAt.getTime() - now.getTime();
        const minutesLeft = Math.floor(timeLeft / 1000 / 60);
        console.log(`Time left: ${minutesLeft} minutes`);
      }
    }
  } catch (error) {
    console.error('❌ Error decoding token:', error);
  }
}

/**
 * Verify token với secret key
 * 
 * Test xem token có valid không và có thể decode được không
 * 
 * @param token - Token to verify
 */
function verifyToken(token: string): void {
  try {
    const decoded = jwt.verify(token, TOKEN_CONFIG.secret) as TokenPayload;
    console.log('\n✅ Token is valid!');
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.error('\n❌ Token has expired!');
      console.error('Expired at:', error.expiredAt);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error('\n❌ Invalid token!');
      console.error('Error:', error.message);
    } else {
      console.error('\n❌ Token verification failed:', error);
    }
  }
}

/**
 * Main function - Generate và display tokens
 * 
 * Chạy function này để generate tokens cho các roles khác nhau
 * và display instructions cho frontend developer
 */
function main(): void {
  console.log('='.repeat(70));
  console.log('🔐 JWT TOKEN GENERATOR FOR DEVELOPMENT');
  console.log('='.repeat(70));
  console.log('');

  // Display configuration info
  console.log('📝 Configuration:');
  console.log(`Secret Key: ${TOKEN_CONFIG.secret.substring(0, 20)}...`);
  console.log(`Expiration: ${TOKEN_CONFIG.expiresIn}`);
  console.log(`Issuer: ${TOKEN_CONFIG.issuer}`);
  console.log('');

  // Generate tokens cho các roles
  console.log('='.repeat(70));
  console.log('🎫 GENERATED TOKENS');
  console.log('='.repeat(70));
  console.log('');

  // Admin token
  console.log('👑 ADMIN TOKEN:');
  const adminToken = generateAdminToken();
  console.log(adminToken);
  console.log('');
  console.log('Usage in API calls:');
  console.log('Authorization: Bearer ' + adminToken);
  console.log('');

  // Teacher token
  console.log('-'.repeat(70));
  console.log('👨‍🏫 TEACHER TOKEN:');
  const teacherToken = generateTeacherToken();
  console.log(teacherToken);
  console.log('');
  console.log('Usage in API calls:');
  console.log('Authorization: Bearer ' + teacherToken);
  console.log('');

  // Student token
  console.log('-'.repeat(70));
  console.log('👨‍🎓 STUDENT TOKEN (Student ID: 1):');
  const studentToken = generateStudentToken(1);
  console.log(studentToken);
  console.log('');
  console.log('Usage in API calls:');
  console.log('Authorization: Bearer ' + studentToken);
  console.log('');

  // Instructions cho frontend
  console.log('='.repeat(70));
  console.log('📖 INSTRUCTIONS FOR FRONTEND DEVELOPERS');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. Copy một trong các tokens ở trên');
  console.log('2. Thêm token vào HTTP request header:');
  console.log('   Authorization: Bearer <your-token-here>');
  console.log('');
  console.log('3. Ví dụ với Axios:');
  console.log('   ```javascript');
  console.log('   const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";');
  console.log('   axios.get("http://localhost:3001/api/exam/exams", {');
  console.log('     headers: {');
  console.log('       Authorization: `Bearer ${token}`');
  console.log('     }');
  console.log('   });');
  console.log('   ```');
  console.log('');
  console.log('4. Ví dụ với Fetch API:');
  console.log('   ```javascript');
  console.log('   fetch("http://localhost:3001/api/exam/exams", {');
  console.log('     headers: {');
  console.log('       "Authorization": `Bearer ${token}`');
  console.log('     }');
  console.log('   });');
  console.log('   ```');
  console.log('');

  // Token expiration warning
  console.log('⚠️  IMPORTANT NOTES:');
  console.log('');
  console.log(`• Tokens expire sau ${TOKEN_CONFIG.expiresIn}`);
  console.log('• Khi token expire, generate lại token mới bằng script này');
  console.log('• JWT_SECRET phải giống với Spring Boot backend');
  console.log('• Trong production, tokens sẽ được Spring Boot backend generate');
  console.log('• Script này CHỈ dùng cho development/testing');
  console.log('');

  // Decode một token để show structure
  console.log('='.repeat(70));
  console.log('🔍 TOKEN STRUCTURE EXAMPLE');
  console.log('='.repeat(70));
  decodeToken(studentToken);
  console.log('');
}

// Export các functions để có thể sử dụng trong tests hoặc scripts khác
export {
  generateToken,
  generateAdminToken,
  generateTeacherToken,
  generateStudentToken,
  generateCustomToken,
  decodeToken,
  verifyToken,
  TokenPayload,
};

// Chạy main function nếu file được execute directly
if (require.main === module) {
  main();
}