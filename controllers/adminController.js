const User = require('../models/User');

// Admin Dashboard page load karne ke liye
exports.getAdminDashboard = async (req, res) => {
    try {
        // Saare students ko database se nikaalo (unke password ko chhod kar)
        const users = await User.find().sort({ createdAt: -1 });
        res.render('pages/admin-dashboard', { user: req.user, users: users });
    } catch (error) {
        console.error("Admin Dashboard Error:", error);
        res.redirect('/dashboard');
    }
};

// User ko premium banane ke liye API
exports.upgradeUser = async (req, res) => {
    try {
        // months: 1, 3, 6 ya 'lifetime'. Kuch na bheje to 3 mahine (pehle jaisa)
        const { userId, months = 3 } = req.body;

        let expiresAt = null; // null = lifetime
        if (String(months) !== 'lifetime') {
            const m = parseInt(months);
            if (!m || m < 1) {
                return res.status(400).json({ success: false, message: "Durée invalide" });
            }
            expiresAt = new Date(Date.now() + m * 30 * 24 * 60 * 60 * 1000);
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                isPremium: true, // AI paywall isi ko check karta hai
                'subscription.plan': 'premium',
                'subscription.expiresAt': expiresAt
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
        }

        res.status(200).json({ success: true, message: `L'utilisateur ${updatedUser.name} est maintenant PREMIUM !` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// 🚀 NAYA: User ko permanently delete karne ke liye API
exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.body;
        
        // Admin ko khud apna account delete karne se rokna
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: "Vous ne pouvez pas supprimer votre propre compte Admin !" });
        }

        await User.findByIdAndDelete(userId);
        res.status(200).json({ success: true, message: "Utilisateur supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};