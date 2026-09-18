const db = require('../src/config/db');
const planService = require('../src/modules/plan/plan.service');
const homeService = require('../src/modules/home/home.service');

async function run() {
  console.log("Setting up user 'Aditya' in database...");
  
  // 1. Check or insert user 'Aditya'
  const userCheck = await db.query("SELECT id FROM users WHERE email = $1", ['aditya@example.com']);
  let userId;
  
  if (userCheck.rows.length > 0) {
    userId = userCheck.rows[0].id;
    await db.query(`
      UPDATE users 
      SET name = $1, age = $2, weight_kg = $3, height_cm = $4, gender = $5, 
          activity_level = $6, equipment = $7, time_budget_minutes = $8, 
          preferred_days = $9, goals = $10, tier = $11, current_streak = $12, rp_total = $13
      WHERE id = $14
    `, [
      'Aditya', 18, 82.0, 182.0, 'male', 
      'intermediate', 'gym', 60, 
      [1, 2, 4, 5], ['fat_loss'], 'gold', 7, 1850,
      userId
    ]);
  } else {
    const insertRes = await db.query(`
      INSERT INTO users (
        name, email, password_hash, age, weight_kg, height_cm, gender, 
        activity_level, equipment, time_budget_minutes, preferred_days, goals, 
        tier, current_streak, rp_total
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING id
    `, [
      'Aditya', 'aditya@example.com', 'hashed_pass_placeholder', 18, 82.0, 182.0, 'male',
      'intermediate', 'gym', 60, [1, 2, 4, 5], ['fat_loss'],
      'gold', 7, 1850
    ]);
    userId = insertRes.rows[0].id;
  }
  
  console.log(`User Aditya ready with ID: ${userId}`);

  // 2. Generate 7-Day Plan for Aditya
  console.log("\nGenerating 7-Day Personalised Workout Plan for Aditya...");
  const plan = await planService.generatePlan(userId);
  console.log("Plan Generated Successfully! Plan Title:", plan.title || 'Weekly Plan');

  // 3. Get Home Dashboard API Response
  console.log("\nFetching Home Dashboard API Response for Aditya...");
  const homeDashboard = await homeService.getHomeDashboard(userId);

  console.log("\n========================================================");
  console.log("HOME PAGE API RESPONSE FOR ADITYA (AFTER PLAN GENERATION):");
  console.log("========================================================");
  console.log(JSON.stringify(homeDashboard, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error("Error in test script:", err);
  process.exit(1);
});
