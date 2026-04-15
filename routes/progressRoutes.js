const express = require('express');
const router = express.Router();
const { markLessonComplete } = require('../controllers/progressController');
const { protect } = require('../middleware/authMiddleware'); 

// 👇 Ek jasoos middleware lagaya hai
router.post('/complete', protect, (req, res, next) => {
    console.log("🕵️‍♂️ ROUTE HIT: Request ne protect middleware ko paar kar liya hai!");
    next();
}, markLessonComplete);

module.exports = router;