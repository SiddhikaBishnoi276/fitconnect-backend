require('dotenv').config();
const cloudinary = require('../src/config/cloudinary.config');

async function testCloudinary() {
  try {
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('API Key:', process.env.CLOUDINARY_API_KEY);
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary Ping Successful! Result:', result);
  } catch (error) {
    console.error('❌ Cloudinary Error Details:', error);
  }
}

testCloudinary();
