// src/presentation/controllers/upload.controller.ts
/**
 * Upload Controller - Xử lý tất cả file upload requests
 * 
 * Controller này là layer giữa HTTP requests và file system.
 * Nó nhận files đã được Multer parse, validate thêm nếu cần,
 * và trả về URLs mà frontend có thể sử dụng.
 * 
 * Workflow summary:
 * 1. Request arrives với multipart/form-data
 * 2. Multer middleware parse và save file to disk
 * 3. Multer attach file info vào req.file hoặc req.files
 * 4. Controller method được gọi
 * 5. Controller validate và generate public URL
 * 6. Controller respond với file URL
 * 
 * QUAN TRỌNG: Controller này CHỈ xử lý file upload.
 * Việc tạo database records (MediaQuestion, etc.) được handle
 * bởi các controllers khác (MediaGroupController).
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';
import { 
  getFileUrl, 
  deleteFile, 
  validateFileSize,
  getFileInfo 
} from '../../infrastructure/upload/upload.config';
import path from 'path';
import fs from 'fs';

export class UploadController {
  /**
   * Upload single audio file
   * 
   * POST /api/exam/upload/audio
   * Content-Type: multipart/form-data
   * Field name: 'audio'
   * 
   * Flow:
   * 1. Multer parse request và save file
   * 2. File info available trong req.file
   * 3. Validate file type (double-check)
   * 4. Generate public URL
   * 5. Return URL to frontend
   * 
   * Frontend sẽ lưu URL này vào MediaQuestion.AudioUrl field
   * khi create media question record.
   * 
   * @param req - Request object with file attached by Multer
   * @param res - Response object
   */
  uploadAudio = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      // Multer middleware đã parse và save file.
      // File info được attach vào req.file
      const file = req.file;

      // Validation 1: Check file exists
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No audio file uploaded',
          error: 'FILE_REQUIRED',
          hint: 'Make sure the form field name is "audio" and Content-Type is multipart/form-data',
        });
        return;
      }

      // Validation 2: Double-check file type
      // Multer đã filter, nhưng belt-and-suspenders approach
      const allowedMimeTypes = [
        'audio/mpeg', 
        'audio/mp3', 
        'audio/wav', 
        'audio/wave',
        'audio/ogg'
      ];
      
      if (!allowedMimeTypes.includes(file.mimetype)) {
        // File không hợp lệ, xóa nó khỏi disk
        deleteFile(file.path);
        
        res.status(400).json({
          success: false,
          message: `Invalid audio type: ${file.mimetype}`,
          error: 'INVALID_FILE_TYPE',
          allowedTypes: allowedMimeTypes,
        });
        return;
      }

      // Validation 3: Check file size (redundant nhưng safe)
      try {
        validateFileSize(file, 20); // 20MB max
      } catch (error) {
        deleteFile(file.path);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(400).json({
          success: false,
          message: errorMessage,
          error: 'FILE_TOO_LARGE',
        });
        return;
      }

      // Generate public URL từ file path
      const fileUrl = getFileUrl(file.path);

      // Log success (useful cho monitoring)
      console.log(`✅ Audio uploaded successfully:`);
      console.log(`   - Original name: ${file.originalname}`);
      console.log(`   - Saved as: ${file.filename}`);
      console.log(`   - Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   - URL: ${fileUrl}`);

      // Respond với file info
      res.status(200).json({
        success: true,
        message: 'Audio file uploaded successfully',
        data: {
          url: fileUrl,                    // URL to use in AudioUrl field
          filename: file.filename,          // Unique filename on server
          originalName: file.originalname,  // Original filename from user
          size: file.size,                  // Size in bytes
          sizeFormatted: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          mimetype: file.mimetype,          // audio/mpeg, etc.
          uploadedAt: new Date().toISOString(),
        },
      });
    }
  );

  /**
   * Upload single image file
   * 
   * POST /api/exam/upload/image
   * Content-Type: multipart/form-data
   * Field name: 'image'
   * 
   * Similar to uploadAudio but for images.
   * Used for Part 1 photos, Part 7 documents, etc.
   * 
   * @param req - Request with image file
   * @param res - Response object
   */
  uploadImage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const file = req.file;

      // Validation 1: File exists
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No image file uploaded',
          error: 'FILE_REQUIRED',
          hint: 'Make sure the form field name is "image" and Content-Type is multipart/form-data',
        });
        return;
      }

      // Validation 2: File type
      const allowedMimeTypes = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif'
      ];
      
      if (!allowedMimeTypes.includes(file.mimetype)) {
        deleteFile(file.path);
        
        res.status(400).json({
          success: false,
          message: `Invalid image type: ${file.mimetype}`,
          error: 'INVALID_FILE_TYPE',
          allowedTypes: allowedMimeTypes,
        });
        return;
      }

      // Validation 3: File size
      try {
        validateFileSize(file, 5); // 5MB max for images
      } catch (error) {
        deleteFile(file.path);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(400).json({
          success: false,
          message: errorMessage,
          error: 'FILE_TOO_LARGE',
        });
        return;
      }

      const fileUrl = getFileUrl(file.path);

      console.log(`✅ Image uploaded successfully:`);
      console.log(`   - Original name: ${file.originalname}`);
      console.log(`   - Saved as: ${file.filename}`);
      console.log(`   - Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   - URL: ${fileUrl}`);

      res.status(200).json({
        success: true,
        message: 'Image file uploaded successfully',
        data: {
          url: fileUrl,
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          sizeFormatted: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString(),
        },
      });
    }
  );

  /**
   * Upload multiple files (audio + image) cùng lúc
   * 
   * POST /api/exam/upload/multiple
   * Content-Type: multipart/form-data
   * Fields: 'audio' (optional), 'image' (optional)
   * 
   * Useful cho Part 1 questions (cần cả audio và image).
   * 
   * Khi sử dụng multiple fields, Multer parse chúng vào req.files
   * as an object với keys là field names:
   * req.files = {
   *   audio: [File],
   *   image: [File]
   * }
   * 
   * @param req - Request with multiple files
   * @param res - Response object
   */
  uploadMultiple = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      // Multer với .fields() middleware parse multiple files
      // Files được access qua req.files as object
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Validation: At least one file
      if (!files || Object.keys(files).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No files uploaded',
          error: 'FILES_REQUIRED',
          hint: 'Upload at least one audio or image file',
        });
        return;
      }

      // Response object để collect URLs
      const response: {
        audio?: any;
        image?: any;
        errors?: string[];
      } = {};
      
      const errors: string[] = [];

      // Process audio file if present
      if (files.audio && files.audio[0]) {
        const audioFile = files.audio[0];
        
        try {
          // Validate audio
          const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/ogg'];
          if (!allowedAudioTypes.includes(audioFile.mimetype)) {
            throw new Error(`Invalid audio type: ${audioFile.mimetype}`);
          }
          
          validateFileSize(audioFile, 20);
          
          // Success - generate URL
          response.audio = {
            url: getFileUrl(audioFile.path),
            filename: audioFile.filename,
            originalName: audioFile.originalname,
            size: audioFile.size,
            sizeFormatted: `${(audioFile.size / 1024 / 1024).toFixed(2)} MB`,
            mimetype: audioFile.mimetype,
          };
          
          console.log(`✅ Audio uploaded: ${audioFile.filename}`);
          
        } catch (error) {
          // Audio upload failed
          deleteFile(audioFile.path);
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Audio upload failed: ${errorMessage}`);
          console.error(`❌ Audio upload failed:`, errorMessage);
        }
      }

      // Process image file if present
      if (files.image && files.image[0]) {
        const imageFile = files.image[0];
        
        try {
          // Validate image
          const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
          if (!allowedImageTypes.includes(imageFile.mimetype)) {
            throw new Error(`Invalid image type: ${imageFile.mimetype}`);
          }
          
          validateFileSize(imageFile, 5);
          
          // Success - generate URL
          response.image = {
            url: getFileUrl(imageFile.path),
            filename: imageFile.filename,
            originalName: imageFile.originalname,
            size: imageFile.size,
            sizeFormatted: `${(imageFile.size / 1024 / 1024).toFixed(2)} MB`,
            mimetype: imageFile.mimetype,
          };
          
          console.log(`✅ Image uploaded: ${imageFile.filename}`);
          
        } catch (error) {
          // Image upload failed
          deleteFile(imageFile.path);
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Image upload failed: ${errorMessage}`);
          console.error(`❌ Image upload failed:`, errorMessage);
        }
      }

      // Nếu cả hai đều fail
      if (!response.audio && !response.image) {
        res.status(400).json({
          success: false,
          message: 'All file uploads failed',
          error: 'UPLOAD_FAILED',
          errors: errors,
        });
        return;
      }

      // Partial or full success
      res.status(200).json({
        success: true,
        message: errors.length > 0 
          ? 'Some files uploaded with errors' 
          : 'All files uploaded successfully',
        data: response,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  );

  /**
   * Delete uploaded file
   * 
   * DELETE /api/exam/upload
   * Body: { filename: string }
   * 
   * Useful scenarios:
   * - User uploaded wrong file và muốn upload lại
   * - User cancel trong quá trình tạo media question
   * - Cleanup sau khi media question bị delete
   * 
   * Security: Chỉ delete files trong uploads/ directory
   * 
   * @param req - Request with filename in body
   * @param res - Response object
   */
  deleteUploadedFile = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const { filename } = req.body;

      // Validation: Filename required
      if (!filename) {
        res.status(400).json({
          success: false,
          message: 'Filename is required',
          error: 'FILENAME_REQUIRED',
        });
        return;
      }

      // Security: Prevent path traversal attacks
      // Chỉ lấy basename, bỏ qua any directory components
      const sanitizedFilename = path.basename(filename);
      
      // File có thể ở audio hoặc images folder
      // Try both locations
      const UPLOAD_BASE = path.join(__dirname, '../../../uploads');
      const possiblePaths = [
        path.join(UPLOAD_BASE, 'audio', sanitizedFilename),
        path.join(UPLOAD_BASE, 'images', sanitizedFilename),
      ];

      let deleted = false;
      let deletedPath = '';
      
      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          try {
            deleteFile(filePath);
            deleted = true;
            deletedPath = filePath;
            break;
          } catch (error) {
            console.error(`Failed to delete ${filePath}:`, error);
          }
        }
      }

      if (deleted) {
        console.log(`🗑️  File deleted: ${sanitizedFilename}`);
        
        res.status(200).json({
          success: true,
          message: 'File deleted successfully',
          data: {
            filename: sanitizedFilename,
            deletedFrom: deletedPath,
          },
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'File not found',
          error: 'FILE_NOT_FOUND',
          filename: sanitizedFilename,
        });
      }
    }
  );

  /**
   * Get file metadata
   * 
   * GET /api/exam/upload/info/:filename
   * 
   * Returns info about an uploaded file without downloading it.
   * Useful for displaying file info trong UI trước khi use.
   * 
   * @param req - Request with filename param
   * @param res - Response object
   */
  getUploadInfo = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const { filename } = req.params;

      if (!filename) {
        res.status(400).json({
          success: false,
          message: 'Filename is required',
          error: 'FILENAME_REQUIRED',
        });
        return;
      }

      const sanitizedFilename = path.basename(filename);
      const UPLOAD_BASE = path.join(__dirname, '../../../uploads');
      const possiblePaths = [
        path.join(UPLOAD_BASE, 'audio', sanitizedFilename),
        path.join(UPLOAD_BASE, 'images', sanitizedFilename),
      ];

      // Try to find file trong cả hai locations
      for (const filePath of possiblePaths) {
        const info = getFileInfo(filePath);
        
        if (info.exists) {
          res.status(200).json({
            success: true,
            data: {
              filename: sanitizedFilename,
              url: getFileUrl(filePath),
              size: info.size,
              sizeFormatted: `${(info.size / 1024 / 1024).toFixed(2)} MB`,
              extension: info.extension,
              created: info.created,
              modified: info.modified,
              type: info.extension.includes('mp3') || info.extension.includes('wav') 
                ? 'audio' 
                : 'image',
            },
          });
          return;
        }
      }

      // File not found trong cả hai locations
      res.status(404).json({
        success: false,
        message: 'File not found',
        error: 'FILE_NOT_FOUND',
        filename: sanitizedFilename,
      });
    }
  );

  /**
   * List all uploaded files (admin only)
   * 
   * GET /api/exam/upload/list?type=audio|image
   * 
   * Returns list of all files trong upload directory.
   * Useful cho admin dashboard để manage uploaded files.
   * 
   * @param req - Request with optional type query param
   * @param res - Response object
   */
  listUploads = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const { type } = req.query;
      
      const UPLOAD_BASE = path.join(__dirname, '../../../uploads');
      const results: any[] = [];
      
      // Determine which directories to scan
      const dirsToScan: string[] = [];
      if (!type || type === 'audio') {
        dirsToScan.push(path.join(UPLOAD_BASE, 'audio'));
      }
      if (!type || type === 'image') {
        dirsToScan.push(path.join(UPLOAD_BASE, 'images'));
      }
      
      // Scan directories
      for (const dir of dirsToScan) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          
          for (const filename of files) {
            const filePath = path.join(dir, filename);
            const info = getFileInfo(filePath);
            
            if (info.exists) {
              results.push({
                filename,
                url: getFileUrl(filePath),
                size: info.size,
                sizeFormatted: `${(info.size / 1024 / 1024).toFixed(2)} MB`,
                type: dir.includes('audio') ? 'audio' : 'image',
                created: info.created,
                modified: info.modified,
              });
            }
          }
        }
      }
      
      // Sort by created date (newest first)
      results.sort((a, b) => 
        new Date(b.created).getTime() - new Date(a.created).getTime()
      );
      
      res.status(200).json({
        success: true,
        data: results,
        count: results.length,
        filter: type || 'all',
      });
    }
  );
}