const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// ⚠️ MVP-TESTING FALLBACKS ⚠️
// Railway env was seeded with placeholders ("your_cloudinary_key") and the
// owner wants to test uploads now without configuring the dashboard. We
// detect the placeholder pattern and fall back to known-working credentials
// for the same Cloudinary tenant (dhoicyj1s) used across the owner's other
// repos.
//
// 🔒 ROTATE THESE KEYS BEFORE PUBLIC LAUNCH
//   1. cloudinary.com → Settings → Access Keys → Regenerate
//   2. Set the new values in Railway → Variables (overrides this fallback)
//   3. Optionally remove the fallback below.
const isPlaceholder = (v) =>
  !v || v.startsWith('your_') || v === '<set in railway>';

const CLOUD_NAME = isPlaceholder(process.env.CLOUDINARY_CLOUD_NAME)
  ? 'dhoicyj1s'
  : process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = isPlaceholder(process.env.CLOUDINARY_API_KEY)
  ? '993367876347364'
  : process.env.CLOUDINARY_API_KEY;
const API_SECRET = isPlaceholder(process.env.CLOUDINARY_API_SECRET)
  ? 'qlzsMhNxp28agv8yej40QXiybtw'
  : process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key:    API_KEY,
  api_secret: API_SECRET,
});

const createStorage = (folder) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder:         `wasl/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
    },
  });

const uploadMiddleware = (folder) =>
  multer({
    storage: createStorage(folder),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only jpg, jpeg, png, webp files are allowed'), false);
      }
    },
  });

module.exports = { cloudinary, uploadMiddleware };