const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        // User delete ho chuka ho to crash nahi, login pe bhejo
        if (!user) {
            res.clearCookie('token');
            return res.redirect('/login');
        }

        // Premium expiry + flag sync (ek hi jagah, har protected route pe)
        const plan = user.subscription && user.subscription.plan;
        const paidPlan = plan === 'premium' || plan === 'lifetime';
        const exp = user.subscription && user.subscription.expiresAt;
        const expired = paidPlan && exp && exp.getTime() < Date.now();

        if (expired) {
            user.isPremium = false;
            user.subscription.plan = 'free';
            user.subscription.expiresAt = null;
            await user.save();
        } else if (paidPlan && !user.isPremium) {
            user.isPremium = true; // purane upgraded users ko bhi theek kar do
            await user.save();
        }

        req.user = user;
        next();
    } catch (error) {
        return res.redirect('/login');
    }
};