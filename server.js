require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); 
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db.js');

// 🚀 NAYA: Google Auth ke liye packages
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/User'); 

// --- Imports (Routes, Controllers & Middleware) ---
const authRoutes = require('./routes/authRoutes');
const progressRoutes = require('./routes/progressRoutes');
const { protect } = require('./middleware/authMiddleware');
const { getDashboard } = require('./controllers/progressController');

// Database se connect karo
connectDB();

const app = express();

// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// 🚀 NAYA: Session setup (Google Auth ke liye zaroori hai)
app.use(session({
    secret: process.env.JWT_SECRET || 'amina_secret_key',
    resave: false,
    saveUninitialized: false
}));

// 🚀 NAYA: Passport.js Initialize
app.use(passport.initialize());
app.use(passport.session());

// 🚀 NAYA: Google Strategy Engine (SMART UPDATE)
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
      try {
          const userEmail = profile.emails[0].value;

          // 🧠 SMART LOGIC: Pehle Email se dhoondo (Duplicate Error se bachne ke liye)
          let user = await User.findOne({ email: userEmail });

          if (user) {
              // Case 1: User mil gaya par pehle Google se nahi aaya tha
              if (!user.googleId) {
                  user.googleId = profile.id; // Google ID link kar do
                  await user.save();
              }
              return done(null, user); 
          } else {
              // Case 2: Bilkul naya banda hai (Database me email nahi hai)
              user = await User.create({
                  googleId: profile.id,
                  name: profile.displayName,
                  email: userEmail,
                  isProfileComplete: false 
              });
              return done(null, user);
          }
      } catch (err) {
          console.error("Passport Google Strategy Error:", err);
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

// 🚀 FIX: PREVENT BACK BUTTON CACHE ISSUE (Ghost Page)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '-1');
    next();
});

// --- View Engine Setup (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- API Routes (Backend logic) ---
app.use('/api/auth', authRoutes); 
app.use('/api/progress', progressRoutes); 

// --- Page Routes (Frontend Views) ---

app.get('/', (req, res) => {
    res.render('index'); 
});

app.get('/register', (req, res) => res.render('pages/register'));
app.get('/login', (req, res) => res.render('pages/login'));

// 🚀 NAYA: Complete Profile Route
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
            console.error("Error reading lesson file:", err);
            res.redirect('/dashboard');
        }
    } else {
        res.redirect('/dashboard');
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});