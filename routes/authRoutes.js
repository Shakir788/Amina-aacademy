const express = require('express');
const router = express.Router();
const passport = require('passport'); 
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); 

// ==========================================
// 1. STANDARD ROUTES (Email / Mot de Passe)
// ==========================================
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// ==========================================
// 2. 🚀 GOOGLE OAUTH ROUTES (Le Système Pro)
// ==========================================
// PRO TIP: 'select_account' add kiya hai taaki user ko account choose karne ka option mile
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account' 
}));

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login?error=google_failed' }), 
    authController.googleCallback
);

router.post('/complete-profile', protect, authController.completeProfile);

module.exports = router;