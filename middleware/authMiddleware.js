const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    let token;

    // Check karo ki cookies mein token hai kya
    if (req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        // Agar token nahi hai, toh login page pe wapis bhej do
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id);
        next(); 
    } catch (error) {
        return res.redirect('/login');
    }
};