// src/infrastructure/upload/upload.config.ts
/**
 * Complete File Upload Configuration với Multer
 * 
 * File này là trái tim của upload system. Nó cấu hình:
 * 1. Nơi files sẽ được lưu (diskStorage)
 * 2. Cách files được đặt tên (filename function)
 * 3. File types nào được chấp nhận (fileFilter)
 * 4. Giới hạn về size và số lượng (limits)
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

/**
 * PHẦN 1: SETUP DIRECTORIES
 * 
 * Trước tiên, chúng ta cần đảm bảo các thư mục để lưu files đã tồn tại.
 * Nếu chưa có, chúng ta sẽ tự động tạo chúng.
 */

const UPLOAD_DIRS = {
  audio: path.join(__dirname, '../../../uploads/audio'),
  images: path.join(__dirname, '../../../uploads/images'),
  temp: path.join(__dirname, '../../../uploads/temp'),
};

// Tạo directories nếu chưa tồn tại
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created upload directory: ${dir}`);
  }
});

/**
 * PHẦN 2: CONFIGURE MULTER STORAGE
 * 
 * diskStorage cho phép chúng ta kiểm soát hoàn toàn:
 * - File sẽ được lưu ở đâu (destination)
 * - File sẽ có tên gì (filename)
 * 
 * Đây là core của upload system. Mỗi khi có file upload request,
 * Multer sẽ gọi hai functions này để quyết định lưu file như thế nào.
 */

const storage = multer.diskStorage({
  /**
   * Destination Function
   * 
   * Function này quyết định file sẽ được lưu vào thư mục nào.
   * Nó được gọi cho mỗi file trong request.
   * 
   * Parameters:
   * - req: Express request object (có thể access user info, body, etc.)
   * - file: Object chứa info về file đang được upload
   * - cb: Callback để báo cho Multer biết destination đã chọn
   * 
   * Logic:
   * - Audio files → uploads/audio/
   * - Image files → uploads/images/
   * - Others → uploads/temp/
   */
  destination: (req: Request, file: Express.Multer.File, cb) => {
    let uploadPath = UPLOAD_DIRS.temp;
    
    // Kiểm tra MIME type để quyết định folder
    if (file.mimetype.startsWith('audio/')) {
      uploadPath = UPLOAD_DIRS.audio;
    } else if (file.mimetype.startsWith('image/')) {
      uploadPath = UPLOAD_DIRS.images;
    }
    
    // Callback với (error, destination)
    // null = no error, uploadPath = nơi lưu file
    cb(null, uploadPath);
  },
  
  /**
   * Filename Function
   * 
   * Function này generate tên file unique để tránh conflicts.
   * Rất quan trọng vì nếu hai users upload file cùng tên,
   * file sau sẽ ghi đè file trước.
   * 
   * Strategy:
   * - Sử dụng timestamp (ms precision) để ensure uniqueness
   * - Thêm random string để đảm bảo thêm nếu có uploads cùng ms
   * - Giữ lại original name (đã sanitized) để dễ identify
   * - Giữ nguyên extension để preserve file type
   * 
   * Format: {timestamp}-{random}-{sanitized_original_name}.{ext}
   * Example: 1702889123456-a3f9b2c1-part1_audio.mp3
   */
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // 1. Get timestamp với millisecond precision
    const timestamp = Date.now();
    
    // 2. Generate random string (base36 = 0-9 + a-z)
    const randomString = Math.random().toString(36).substring(2, 15);
    
    // 3. Extract extension từ original filename
    const ext = path.extname(file.originalname);
    
    // 4. Get filename without extension
    const nameWithoutExt = path.basename(file.originalname, ext);
    
    // 5. Sanitize original filename
    // Replace tất cả non-alphanumeric chars với underscore
    // Điều này prevent path traversal attacks và special char issues
    const sanitizedName = nameWithoutExt
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .substring(0, 50); // Limit length
    
    // 6. Construct final unique filename
    const uniqueFilename = `${timestamp}-${randomString}-${sanitizedName}${ext}`;
    
    cb(null, uniqueFilename);
  },
});

/**
 * PHẦN 3: FILE FILTER VALIDATION
 * 
 * fileFilter function validate file types trước khi accept.
 * Đây là first line of defense against malicious uploads.
 * 
 * Function này được gọi cho mỗi file, và nó phải decide:
 * - Accept file (cb(null, true))
 * - Reject file (cb(null, false) hoặc cb(error))
 * 
 * Validation strategy:
 * - Whitelist approach: Chỉ accept known-good MIME types
 * - Reject all others với clear error message
 */

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Define allowed MIME types
  const allowedAudioTypes = [
    'audio/mpeg',      // MP3
    'audio/mp3',       // MP3 (alternative)
    'audio/wav',       // WAV
    'audio/wave',      // WAV (alternative)
    'audio/ogg',       // OGG
  ];
  
  const allowedImageTypes = [
    'image/jpeg',      // JPEG
    'image/jpg',       // JPG
    'image/png',       // PNG
    'image/gif',       // GIF
  ];
  
  const allAllowedTypes = [...allowedAudioTypes, ...allowedImageTypes];
  
  // Check if file type is in allowed list
  if (allAllowedTypes.includes(file.mimetype)) {
    // Accept file
    cb(null, true);
  } else {
    // Reject file với descriptive error
    cb(new Error(
      `Invalid file type: ${file.mimetype}. ` +
      `Allowed types: ${allAllowedTypes.join(', ')}`
    ));
  }
};

/**
 * PHẦN 4: MAIN UPLOAD CONFIGURATION
 * 
 * Đây là object chính được export và sử dụng trong routes.
 * Nó kết hợp tất cả các configs ở trên.
 * 
 * Limits được set để prevent abuse và ensure server stability:
 * - 20MB max per file: Đủ lớn cho TOEIC audio (~10MB)
 * - 5 files max: Prevent DOS bằng cách upload quá nhiều files
 */

export const uploadConfig = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024,  // 20MB in bytes
    files: 5,                      // Max 5 files per request
    fields: 10,                    // Max 10 non-file fields
  },
});

/**
 * PHẦN 5: SPECIALIZED UPLOAD CONFIGS
 * 
 * Đôi khi chúng ta muốn stricter rules cho specific use cases.
 * Ví dụ: Audio-only endpoint không nên accept images.
 */

// Audio-only upload configuration
export const audioUpload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only audio files allowed. Received: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024,  // 20MB
    files: 1,                      // Only 1 audio file
  },
});

// Image-only upload configuration
export const imageUpload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files allowed. Received: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5MB
    files: 1,                      // Only 1 image file
  },
});

/**
 * PHẦN 6: HELPER FUNCTIONS
 * 
 * Các utility functions để làm việc với uploaded files.
 */

/**
 * Delete file from disk
 * 
 * Sử dụng khi:
 * - Upload failed và cần cleanup
 * - User xóa media question
 * - File không hợp lệ sau khi upload
 * 
 * @param filePath - Absolute path đến file cần xóa
 */
export const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Deleted file: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error deleting file ${filePath}:`, error);
  }
};

/**
 * Generate public URL cho file
 * 
 * Khi file được lưu tại /absolute/path/uploads/audio/file.mp3,
 * chúng ta cần convert thành URL mà frontend có thể access:
 * http://localhost:3001/uploads/audio/file.mp3
 * 
 * Function này extract relative path và construct full URL.
 * 
 * @param filePath - Absolute file path from disk
 * @returns Public URL accessible từ frontend
 */
export const getFileUrl = (filePath: string): string => {
  // Find index của 'uploads' trong path
  const uploadsIndex = filePath.indexOf('uploads');
  
  if (uploadsIndex === -1) {
    // Nếu không tìm thấy 'uploads', return as-is
    return filePath;
  }
  
  // Extract relative path từ 'uploads' onwards
  const relativePath = filePath.substring(uploadsIndex);
  
  // Get base URL từ environment hoặc default
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  
  // Construct full URL
  // Replace backslashes với forward slashes (Windows compatibility)
  return `${baseUrl}/${relativePath.replace(/\\/g, '/')}`;
};

/**
 * Get file info without reading content
 * 
 * @param filePath - Path to file
 * @returns File metadata (size, created date, etc.)
 */
export const getFileInfo = (filePath: string): any => {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: path.extname(filePath),
      };
    }
    return { exists: false };
  } catch (error) {
    console.error(`Error getting file info for ${filePath}:`, error);
    return { exists: false, error: (error as Error).message };
  }
};

/**
 * Validate uploaded file size
 * 
 * Additional validation after Multer (belt and suspenders approach)
 * 
 * @param file - Multer file object
 * @param maxSizeMB - Maximum allowed size in MB
 * @returns true if valid, throws error if not
 */
export const validateFileSize = (file: Express.Multer.File, maxSizeMB: number): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (file.size > maxSizeBytes) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. ` +
      `Maximum allowed: ${maxSizeMB}MB`
    );
  }
  
  return true;
};

// Export directories cho use trong other modules
export { UPLOAD_DIRS };