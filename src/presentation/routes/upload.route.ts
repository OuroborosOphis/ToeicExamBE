// src/presentation/routes/upload.routes.ts
/**
 * Upload Routes - Định nghĩa tất cả endpoints cho file uploads
 * 
 * Routes file này kết nối HTTP endpoints với controller methods.
 * Mỗi route sử dụng appropriate Multer middleware để parse files.
 * 
 * Route structure:
 * - POST /audio: Upload single audio file
 * - POST /image: Upload single image file  
 * - POST /multiple: Upload audio + image together
 * - DELETE /: Delete an uploaded file
 * - GET /info/:filename: Get file metadata
 * - GET /list: List all uploads (admin)
 * 
 * Tất cả routes yêu cầu authentication, và hầu hết yêu cầu
 * teacher hoặc admin role.
 */

import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { 
  requireTeacherOrAdmin,
  requireAdmin 
} from '../middlewares/authorization.middleware';
import { 
  audioUpload, 
  imageUpload, 
  uploadConfig 
} from '../../infrastructure/upload/upload.config';

const router = Router();
const uploadController = new UploadController();

/**
 * POST /api/exam/upload/audio
 * 
 * Upload single audio file
 * 
 * Request format: multipart/form-data
 *   - Field name: 'audio'
 *   - Allowed types: mp3, wav, ogg
 *   - Max size: 20MB
 * 
 * Middleware chain:
 * 1. authMiddleware: Verify JWT token
 * 2. requireTeacherOrAdmin: Check user role
 * 3. audioUpload.single('audio'): Multer parse audio field
 * 4. uploadController.uploadAudio: Handle upload logic
 * 
 * Response: { url, filename, size, ... }
 * 
 * Frontend usage example:
 * ```javascript
 * const formData = new FormData();
 * formData.append('audio', audioFile);
 * 
 * const response = await fetch('/api/exam/upload/audio', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': `Bearer ${token}`
 *     // DON'T set Content-Type - browser sets it automatically with boundary
 *   },
 *   body: formData
 * });
 * ```
 */
router.post(
  '/audio',
  authMiddleware,
  requireTeacherOrAdmin,
  audioUpload.single('audio'),  // Multer middleware
  uploadController.uploadAudio
);

/**
 * POST /api/exam/upload/image
 * 
 * Upload single image file
 * 
 * Request format: multipart/form-data
 *   - Field name: 'image'
 *   - Allowed types: jpeg, jpg, png, gif
 *   - Max size: 5MB
 * 
 * Similar to audio upload but for images.
 */
router.post(
  '/image',
  authMiddleware,
  requireTeacherOrAdmin,
  imageUpload.single('image'),  // Multer middleware
  uploadController.uploadImage
);

/**
 * POST /api/exam/upload/multiple
 * 
 * Upload multiple files (audio + image) cùng lúc
 * 
 * Request format: multipart/form-data
 *   - Field 'audio': audio file (optional)
 *   - Field 'image': image file (optional)
 * 
 * At least one file must be provided.
 * 
 * Useful cho Part 1 questions cần cả audio và image.
 * 
 * Frontend usage:
 * ```javascript
 * const formData = new FormData();
 * if (audioFile) formData.append('audio', audioFile);
 * if (imageFile) formData.append('image', imageFile);
 * 
 * const response = await fetch('/api/exam/upload/multiple', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: formData
 * });
 * 
 * const { audio, image } = response.data.data;
 * // audio.url, image.url
 * ```
 */
router.post(
  '/multiple',
  authMiddleware,
  requireTeacherOrAdmin,
  uploadConfig.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),  // Multer middleware for multiple fields
  uploadController.uploadMultiple
);

/**
 * DELETE /api/exam/upload
 * 
 * Delete an uploaded file
 * 
 * Request body: { filename: string }
 * 
 * Useful scenarios:
 * - User uploaded wrong file
 * - User cancels media creation
 * - Cleanup after deletion
 * 
 * Security: Path traversal protection built-in
 */
router.delete(
  '/',
  authMiddleware,
  requireTeacherOrAdmin,
  uploadController.deleteUploadedFile
);

/**
 * GET /api/exam/upload/info/:filename
 * 
 * Get file metadata
 * 
 * Path params: filename
 * 
 * Returns: size, created date, type, URL, etc.
 * 
 * Useful for displaying file info before using it.
 */
router.get(
  '/info/:filename',
  authMiddleware,
  uploadController.getUploadInfo
);

/**
 * GET /api/exam/upload/list
 * 
 * List all uploaded files
 * 
 * Query params:
 *   - type: 'audio' | 'image' (optional, default: all)
 * 
 * Admin only - for file management dashboard.
 * 
 * Returns array of file metadata sorted by upload date.
 */
router.get(
  '/list',
  authMiddleware,
  requireAdmin,  // Only admins can list all files
  uploadController.listUploads
);

/**
 * Error Handling for Multer
 * 
 * Multer errors (như file too large, invalid type) được thrown
 * as errors và caught bởi Express error handler.
 * 
 * Để provide better error messages, chúng ta có thể add một
 * error handler middleware specifically cho Multer errors.
 */
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof Error) {
    // Multer errors
    if (error.message.includes('File too large')) {
      return res.status(413).json({
        success: false,
        message: 'File too large',
        error: 'FILE_TOO_LARGE',
        details: error.message,
      });
    }
    
    if (error.message.includes('Invalid file type') || 
        error.message.includes('Only')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type',
        error: 'INVALID_FILE_TYPE',
        details: error.message,
      });
    }
    
    if (error.message.includes('Too many files')) {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
        error: 'TOO_MANY_FILES',
        details: error.message,
      });
    }
  }
  
  // Pass to global error handler
  next(error);
});

export default router;