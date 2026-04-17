const { uploadMiddleware } = require('../config/cloudinary');

const uploadAvatar     = uploadMiddleware('avatars').single('avatar');
const uploadDocument   = uploadMiddleware('documents').single('document');
const uploadOrderPhoto = uploadMiddleware('orders').array('photos', 10);
const uploadMessage    = uploadMiddleware('messages').single('media');

const handleUploadError = (err, req, res, next) => {
  if (err) {
    const { error } = require('../utils/response');
    if (err.code === 'LIMIT_FILE_SIZE') {
      return error(res, 'File size exceeds 5MB limit', 400);
    }
    return error(res, err.message || 'File upload failed', 400);
  }
  next();
};

module.exports = {
  uploadAvatar,
  uploadDocument,
  uploadOrderPhoto,
  uploadMessage,
  handleUploadError,
};