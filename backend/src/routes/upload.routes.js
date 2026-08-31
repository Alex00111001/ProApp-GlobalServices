const express = require('express');
const router = express.Router();
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');
const { authenticate, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/require-permission');
const { PERMISSIONS } = require('../modules/identity/permission-catalog');

// Subir archivo a Cloudinary
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder = req.body.folder || 'services-platform';
    
    const result = await uploadToCloudinary(req.file, folder);

    res.json({
      message: 'File uploaded successfully',
      url: result.url,
      publicId: result.publicId,
      format: result.format,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Subir múltiples archivos (para portafolio)
router.post('/upload-multiple', authenticate, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const folder = req.body.folder || 'services-platform/portfolio';
    const results = [];

    for (const file of req.files) {
      const result = await uploadToCloudinary(file, folder);
      results.push(result);
    }

    res.json({
      message: 'Files uploaded successfully',
      files: results,
    });
  } catch (error) {
    console.error('Upload multiple error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Subir documento de profesional (antecedentes, certificación, etc.)
router.post('/professional/document', authenticate, authorize('PROFESSIONAL'), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document uploaded' });
    }

    const { type } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Document type is required' });
    }

    // Subir a Cloudinary
    const result = await uploadToCloudinary(req.file, 'services-platform/documents');

    // Guardar en la base de datos
    const professionalProfile = await prisma.professionalProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!professionalProfile) {
      return res.status(404).json({ error: 'Professional profile not found' });
    }

    const document = await prisma.document.create({
      data: {
        professionalId: professionalProfile.id,
        type,
        documentUrl: result.url,
        status: 'PENDING_REVIEW',
      },
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document.id,
        type: document.type,
        url: result.url,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Subir foto al portafolio del profesional
router.post('/professional/portfolio', authenticate, authorize('PROFESSIONAL'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const { title, description, categoryId, displayOrder = 0 } = req.body;

    // Subir a Cloudinary
    const result = await uploadToCloudinary(req.file, 'services-platform/portfolio');

    // Guardar en la base de datos
    const professionalProfile = await prisma.professionalProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!professionalProfile) {
      return res.status(404).json({ error: 'Professional profile not found' });
    }

    const portfolio = await prisma.portfolio.create({
      data: {
        professionalId: professionalProfile.id,
        imageUrl: result.url,
        title: title || null,
        description: description || null,
        categoryId: categoryId || null,
        displayOrder: parseInt(displayOrder),
      },
    });

    res.status(201).json({
      message: 'Portfolio item created successfully',
      portfolio: {
        id: portfolio.id,
        imageUrl: result.url,
        title: portfolio.title,
        displayOrder: portfolio.displayOrder,
        createdAt: portfolio.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload portfolio error:', error);
    res.status(500).json({ error: 'Failed to upload portfolio image' });
  }
});

// Eliminar archivo de Cloudinary
router.delete('/delete/:publicId', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const { publicId } = req.params;

    const success = await deleteFromCloudinary(publicId);

    if (success) {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(400).json({ error: 'Failed to delete file' });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
