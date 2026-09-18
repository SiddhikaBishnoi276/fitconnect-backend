require('dotenv').config();
const cloudinary = require('../src/config/cloudinary.config');

async function testUpload() {
  try {
    console.log('Uploading sample image to Cloudinary...');
    const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
      folder: 'fitconnect_uploads_test',
    });

    console.log('🎉 Upload Successful!');
    console.log('Public ID:', uploadResult.public_id);
    console.log('Secure URL:', uploadResult.secure_url);
  } catch (error) {
    console.error('❌ Upload Failed:', error.message);
  }
}

testUpload();
