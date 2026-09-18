const homeService = require('../src/modules/home/home.service');

async function test() {
  console.log("Testing homeService.getHomeDashboard...");
  try {
    // Pass a dummy userId or valid UUID string to test payload construction
    const data = await homeService.getHomeDashboard('00000000-0000-0000-0000-000000000000');
    console.log("SUCCESS! Dashboard Payload Output:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("ERROR running homeService test:", err);
  }
  process.exit(0);
}

test();
