const express = require('express');
const router = express.Router();
const passport = require('passport'); // 🚀 NAYA: Google Auth chalane ke liye
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); // 🚀 NAYA: Security ke liye

// ==========================================
// 1. STANDARD ROUTES (Email / Mot de Passe)
// ==========================================
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// ==========================================
// 2. 🚀 GOOGLE OAUTH ROUTES (Le Système Pro)
// ==========================================
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }), 
    authController.googleCallback
);

router.post('/complete-profile', protect, authController.completeProfile);

module.exports = router;