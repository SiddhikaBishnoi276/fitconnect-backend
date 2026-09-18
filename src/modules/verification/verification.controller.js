// Verification controller: handles activity verification checks and community flags
const verificationService = require('./verification.service');
const { sendSuccess } = require('../../utils/responseFormatter');

/**
 * Vote (genuine or flag) on a PR
 * @route POST /api/v1/social/verification/prs/:prId/vote
 */
const voteOnPR = async (req, res, next) => {
  try {
    const { prId } = req.params;
    const { vote } = req.body; // 'genuine' or 'flag'
    
    const result = await verificationService.castVote(prId, req.user.id, vote);
    return sendSuccess(res, result, 'Vote cast successfully', 201);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  voteOnPR,
};
