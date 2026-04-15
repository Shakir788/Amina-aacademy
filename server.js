require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); 
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const connectDB = require('./config/db.js');
const User = require('./models/User'); 

// --- Imports (Routes, Controllers & Middleware) ---
const authRoutes = require('./routes/authRoutes');
const progressRoutes = require('./routes/progressRoutes');
const { protect } = require('./middleware/authMiddleware');
const { getDashboard } = require('./controllers/progressController');

// Database Connection
connectDB();

const app = express();

// 🚀 VERCEL FIX: Trust proxy for secure cookies/sessions
app.set('trust proxy', 1); 

// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// 🚀 Session Setup (Optimized for Production)
app.use(session({
    secret: process.env.JWT_SECRET || 'amina_secret_key',
    resave: true, // Vercel/Serverless ke liye true rakhna behtar hai
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Production mein HTTPS mandatory hai
        maxAge: 24 * 60 * 60 * 1000 // 24 Hours
    }
}));

// --- Passport.js Initialize ---
app.use(passport.initialize());
app.use(passport.session());

// 🧠 Smart Google Strategy: Prevents Duplicate Email Errors
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true // Ensures redirect works on HTTPS (Vercel)
  },
  async (accessToken, refreshToken, profile, done) => {
      try {
          const userEmail = profile.emails[0].value;

          // Check if user exists by Email first
          let user = await User.findOne({ email: userEmail });

          if (user) {
              // If user exists but doesn't have a googleId, link it
              if (!user.googleId) {
                  user.googleId = profile.id;
                  await user.save();
              }
              return done(null, user); 
          } else {
              // Create brand new user if email doesn't exist
              user = await User.create({
                  googleId: profile.id,
                  name: profile.displayName,
                  email: userEmail,
                  isProfileComplete: false 
              });
              return done(null, user);
          }
      } catch (err) {
          console.error("Google Auth Error:", err);
          return done(err, false);
      }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// 🛡️ Security: Prevent Back-Button Cache (Sensitive Pages)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '-1');
    next();
});

// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- API Routes ---
app.use('/api/auth', authRoutes); 
app.use('/api/progress', progressRoutes); 

// --- Page Routes ---
app.get('/', (req, res) => res.render('index'));
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/login', (req, res) => res.render('pages/login'));

app.get('/complete-profile', protect, (req, res) => {
    res.render('pages/complete-profile', { user: req.user });
});

app.get('/dashboard', protect, getDashboard);

app.get('/lesson/:id', protect, (req, res) => {
    const lessonId = req.params.id;
    const filePath = path.join(__dirname, 'data', `lesson${lessonId}.json`);

    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath);
            const lessonData = JSON.parse(rawData);
            res.render('pages/lesson', { 
                user: req.user, 
                lessonId: lessonId,
                lesson: lessonData 
            });
        } catch (err) {
            console.error("File Read Error:", err);
            res.redirect('/dashboard');
        }
    } else {
        res.redirect('/dashboard');
    }
});

// --- Server & Vercel Export ---
const PORT = process.env.PORT || 3000;

// Local dev ke liye listen, Vercel handle karega exports ko
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app; 