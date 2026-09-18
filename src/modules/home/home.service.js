/**
 * Home Service - Aggregates user header (name, greeting, streak), 
 * training plan status, nutrition plan status, and gamification stats (streak, tier, total RP).
 */
const profileModel = require('../profile/profile.model');
const planModel = require('../plan/plan.model');
const dietService = require('../diet/diet.service');

/**
 * Returns dynamic time-based greeting string.
 * @returns {string}
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Retrieves aggregated dashboard data for the home screen matching the app UI layout.
 * @param {string|number} userId
 * @returns {Promise<Object>}
 */
async function getHomeDashboard(userId) {
  // Fetch user profile summary, active workout plan, and today's diet plan concurrently
  const [userProfile, activePlan, nutrition] = await Promise.all([
    profileModel.getUserProfileSummary(userId).catch(() => null),
    planModel.getActivePlanWithDetails(userId).catch(() => null),
    dietService.getTodayPlan(userId).catch(() => ({ has_plan: false })),
  ]);

  const userName = userProfile?.name || 'Athlete';
  const currentStreak = userProfile?.current_streak || 0;
  const tier = userProfile?.tier || 'Bronze';
  const rpTotal = userProfile?.rp_total || 0;

  const greeting = getGreeting();

  // Header data
  const header = {
    greeting,
    user_name: userName,
    display_greeting: `${greeting}, ${userName}`,
    streak_days: currentStreak,
    streak_text: `${currentStreak}-day streak • Keep it going`,
    unread_notifications_count: 0,
  };

  // Today's Session card data
  let todaySession = null;
  if (!activePlan) {
    todaySession = {
      has_plan: false,
      title: "Your first week isn't built yet",
      subtitle: "Tap below to generate your personalised 7-day training plan. Takes about 5 seconds.",
      action_button: "Generate My 7-Day Plan →",
      action_endpoint: "/api/v1/plans/generate",
    };
  } else {
    const dayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon ...
    const dayIndex = dayOfWeek === 0 ? 7 : dayOfWeek;
    const todayPlanDay = Array.isArray(activePlan.days)
      ? activePlan.days.find((d) => Number(d.day_index) === dayIndex) || activePlan.days[0]
      : null;

    todaySession = {
      has_plan: true,
      plan_id: activePlan.plan_id,
      title: todayPlanDay ? todayPlanDay.title : "Today's Session",
      today_workout: todayPlanDay,
      action_button: "Start Workout",
      action_endpoint: `/api/v1/plans/days/${dayIndex}`,
    };
  }

  // Today's Nutrition card data
  let todayNutrition = null;
  if (!nutrition || !nutrition.has_plan) {
    todayNutrition = {
      has_plan: false,
      title: "TODAY'S NUTRITION",
      subtitle: "Meal plan and macro targets will be generated to match your training load.",
      action_button: "Generate My Meal Plan →",
      action_endpoint: "/api/v1/diet/generate",
    };
  } else {
    todayNutrition = {
      has_plan: true,
      data: nutrition,
      action_button: "View Meal Plan",
      action_endpoint: "/api/v1/diet/today",
    };
  }

  // Bottom Stats cards (Streak, Tier, Total RP)
  const stats = {
    streak: {
      value: currentStreak,
      display: `${currentStreak}d`,
      label: "STREAK",
    },
    tier: {
      value: tier,
      display: tier,
      label: "TIER",
    },
    total_rp: {
      value: rpTotal,
      display: Number(rpTotal).toLocaleString(),
      label: "TOTAL RP",
    },
  };

  return {
    header,
    today_session: todaySession,
    today_nutrition: todayNutrition,
    stats,
    plan: activePlan,
    nutrition: nutrition,
    notifications: [],
  };
}

module.exports = {
  getHomeDashboard,
};

