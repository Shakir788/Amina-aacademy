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

const authRoutes = require('./routes/authRoutes');
const progressRoutes = require('./routes/progressRoutes');
const aiRoutes = require('./routes/aiRoutes'); 
const { protect } = require('./middleware/authMiddleware');
const { getDashboard } = require('./controllers/progressController');

const { isAdmin } = require('./middleware/adminMiddleware');
const { getAdminDashboard, upgradeUser, deleteUser } = require('./controllers/adminController');

connectDB();

const app = express();

app.set('trust proxy', 1); 

// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// Session
app.use(session({
    secret: process.env.JWT_SECRET || 'amina_secret_key',
    resave: false,           // ✅ FIX: true → false (unnecessary resaves)
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,      // ✅ ADD: XSS protection
        sameSite: 'lax',     // ✅ ADD: CSRF protection
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true 
  },
  async (accessToken, refreshToken, profile, done) => {
      try {
          const userEmail = profile.emails[0].value;
          let user = await User.findOne({ email: userEmail });

          if (user) {
              if (!user.googleId) {
                  user.googleId = profile.id;
                  await user.save();
              }
              return done(null, user); 
          } else {
              user = await User.create({
                  googleId: profile.id,
                  name: profile.displayName,
                  email: userEmail,
                  isProfileComplete: false 
              });
              return done(null, user);
          }
      } catch (err) {
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

// Cache-Control
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '-1');
    next();
});

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- API Routes ---
app.use('/api/auth', authRoutes); 
app.use('/api/progress', progressRoutes); 
app.use('/api/ai', aiRoutes); 

app.post('/api/admin/upgrade', protect, isAdmin, upgradeUser);
app.post('/api/admin/delete', protect, isAdmin, deleteUser);

// --- Page Routes ---
app.get('/', (req, res) => res.render('index'));
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/complete-profile', protect, (req, res) => {
    res.render('pages/complete-profile', { user: req.user });
});
app.get('/dashboard', protect, getDashboard);
app.get('/premium', protect, (req, res) => {
    res.render('pages/premium', { user: req.user });
});
app.get('/admin/dashboard', protect, isAdmin, getAdminDashboard);

// Backward compat
app.get('/lesson/:id', protect, (req, res) => {
    res.redirect(`/lesson/accounting/${req.params.id}`);
});

// ✅ Course config map — easy to extend
const COURSE_CONFIG = {
    marketing: { folder: 'data/marketing', filePrefix: 'phase', view: 'pages/lesson-marketing' },
    english:   { folder: 'data/english',   filePrefix: 'phase', view: 'pages/lesson-english' },
};
const DEFAULT_COURSE = { folder: 'data', filePrefix: 'lesson', view: 'pages/lesson' };

app.get('/lesson/:course/:id', protect, (req, res) => {
    const { course, id } = req.params;

    // ✅ FIX: Validate id — only allow numbers
    if (!/^\d+$/.test(id)) {
        return res.redirect('/dashboard');
    }

    const config = COURSE_CONFIG[course] || DEFAULT_COURSE;
    const filePath = path.join(__dirname, config.folder, `${config.filePrefix}${id}.json`);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File NOT Found: ${filePath}`);
        return res.redirect('/dashboard');
    }

    try {
        const parsedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // If phase-based course → send lessons array; else send raw
        const isPhase = course === 'marketing' || course === 'english';
        const lessonContent = isPhase && parsedData.lessons ? parsedData.lessons : parsedData;

        res.render(config.view, { 
            user: req.user, 
            lessonId: id,
            courseType: course,
            lesson: lessonContent,
            lessonData: lessonContent  // backward compat
        });
    } catch (err) {
        console.error("❌ JSON Parse Error:", err);
        res.redirect('/dashboard');
    }
});

// ✅ 404 handler
app.use((req, res) => {
    res.status(404).redirect('/dashboard');
});

// ✅ Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).send('Something went wrong.');
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;