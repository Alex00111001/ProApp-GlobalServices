const multer = require('multer');
const storage = multer.memoryStorage();

// Filtro para validar tipos de archivos
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  if (allowedMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, and DOCX are allowed.'));
  }
};

// Middleware de subida
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter,
});

module.exports = upload;
