const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 

// Token banane ka function
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register a new user (Email/Password)
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.render('pages/register', { error: 'Cet utilisateur existe déjà. Veuillez vous connecter.' });
        }

        // Naya user banao
        const user = await User.create({
            name,
            email,
            password,
            isProfileComplete: true
        });

        if (user) {
            const token = generateToken(user._id);
            res.cookie('token', token, {
                httpOnly: true,
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            });

            // Success par dashboard bhej do
            res.redirect('/dashboard');
        }
    } catch (error) {
        res.render('pages/register', { error: 'Erreur lors de la création du compte.' });
    }
};

// @desc    Login user (Email/Password)
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('pages/login', { error: 'Veuillez fournir un email et un mot de passe.' });
        }

        const user = await User.findOne({ email }).select('+password');
        
        if (!user) {
            return res.render('pages/login', { error: 'Identifiants invalides.' }); 
        }

        if (!user.password) {
            return res.render('pages/login', { error: 'Ce compte utilise Google. Veuillez cliquer sur "Se connecter avec Google".' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('pages/login', { error: 'Identifiants invalides.' }); 
        }

        const token = generateToken(user._id);
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000, 
        });

        res.redirect('/dashboard');

    } catch (error) {
        res.render('pages/login', { error: 'Erreur de connexion.' });
    }
};

// @desc    Logout user
exports.logout = (req, res) => {
    res.clearCookie('token'); 
    res.redirect('/login');
};

// ==========================================
// 🚀 GOOGLE OAUTH LOGIC (NAYA SECTION)
// ==========================================

exports.googleCallback = async (req, res) => {
    try {
       
        const user = req.user;

        // JWT Token banao
        const token = generateToken(user._id);
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        if (user.isProfileComplete) {
            // Purana user -> Seedha Dashboard
            res.redirect('/dashboard');
        } else {
            
            res.redirect('/complete-profile');
        }
    } catch (error) {
        console.error("Google Callback Error:", error);
        res.redirect('/login');
    }
};
exports.completeProfile = async (req, res) => {
    try {
        const { name } = req.body; 

    
        await User.findByIdAndUpdate(
            req.user._id, 
            { 
                name: name,
                isProfileComplete: true 
            }
        );

        res.redirect('/dashboard');
    } catch (error) {
        console.error("Profile Complete Error:", error);
        res.render('pages/complete-profile', { error: 'Erreur lors de la mise à jour du profil.' });
    }
};