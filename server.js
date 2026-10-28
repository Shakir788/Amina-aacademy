require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); 
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const http = require('http'); 
const WebSocket = require('ws'); 

const connectDB = require('./config/db.js');
const User = require('./models/User'); 

const authRoutes = require('./routes/authRoutes');
const progressRoutes = require('./routes/progressRoutes');
const aiRoutes = require('./routes/aiRoutes'); 
const { protect } = require('./middleware/authMiddleware');
const { getDashboard } = require('./controllers/progressController');
const { isAdmin } = require('./middleware/adminMiddleware');
const { getAdminDashboard, upgradeUser, deleteUser } = require('./controllers/adminController');

// 🔥 IMPORT THE REAL AI VOICE PROXY 🔥
const attachLiveVoiceProxy = require('./liveVoiceProxy');

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
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        sameSite: 'lax',
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
              if (!user.googleId) { user.googleId = profile.id; await user.save(); }
              return done(null, user); 
          } else {
              user = await User.create({
                  googleId: profile.id, name: profile.displayName,
                  email: userEmail, isProfileComplete: false 
              });
              return done(null, user);
          }
      } catch (err) { return done(err, false); }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { const user = await User.findById(id); done(null, user); } catch (err) { done(err, null); }
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
app.get('/', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('index');
});
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/complete-profile', protect, (req, res) => res.render('pages/complete-profile', { user: req.user }));
app.get('/dashboard', protect, getDashboard);
app.get('/premium', protect, (req, res) => res.render('pages/premium', { user: req.user }));
app.get('/admin/dashboard', protect, isAdmin, getAdminDashboard);

// Compatibility
app.get('/lesson/:id', protect, (req, res) => res.redirect(`/lesson/accounting/${req.params.id}`));

// --- Course Configuration ---
const COURSE_CONFIG = {
    marketing:  { folder: 'data/marketing',  filePrefix: 'phase', view: 'pages/lesson-marketing' },
    english:    { folder: 'data/english',    filePrefix: 'phase', view: 'pages/lesson-english' },
    accounting: { folder: 'data/accounting', filePrefix: 'phase', view: 'pages/lesson' }
};
const DEFAULT_COURSE = { folder: 'data', filePrefix: 'lesson', view: 'pages/lesson' };

// --- Lesson Route (Smart Search Fix) ---
app.get('/lesson/:course/:id', protect, (req, res) => {
    const { course, id } = req.params;
    
    if (!/^\d+$/.test(id)) return res.redirect('/dashboard');

    
    // Free users sirf Phase 1 ke lessons dekh sakte hain
    if (!req.user.isPremium && req.user.role !== 'admin') {
        let freeIds = [];
        const cfg = COURSE_CONFIG[course];
        if (cfg) {
            try {
                const p1 = JSON.parse(fs.readFileSync(path.join(__dirname, cfg.folder, 'phase1.json'), 'utf8'));
                const list = Array.isArray(p1) ? p1 : (p1.lessons || [p1]);
                freeIds = list.map(l => Number(l.id));
            } catch (e) {}
        }
        if (!freeIds.includes(Number(id))) return res.redirect('/premium');
    }

    const config = COURSE_CONFIG[course] || DEFAULT_COURSE;
    const folderPath = path.join(__dirname, config.folder);

    if (!fs.existsSync(folderPath)) {
        console.error(`❌ Folder NOT Found: ${folderPath}`);
        return res.redirect('/dashboard');
    }

    try {
        const files = fs.readdirSync(folderPath);
        let correctLessonData = null;

        for (const file of files) {
            if (file.startsWith(config.filePrefix) && file.endsWith('.json')) {
                const filePath = path.join(folderPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const parsedData = JSON.parse(fileContent);

                if (Array.isArray(parsedData)) {
                    const foundLesson = parsedData.find(l => String(l.id) === String(id));
                    if (foundLesson) {
                        correctLessonData = foundLesson;
                        break;
                    }
                } 
                else if (parsedData.lessons && Array.isArray(parsedData.lessons)) {
                    const foundLesson = parsedData.lessons.find(l => String(l.id) === String(id));
                    if (foundLesson) {
                        correctLessonData = foundLesson;
                        break;
                    }
                } 
                else if (String(parsedData.id) === String(id)) {
                    correctLessonData = parsedData;
                    break;
                }
            }
        }

        if (!correctLessonData) {
            console.error(`❌ Lesson id=${id} not found in any ${config.filePrefix} file inside ${folderPath}`);
            return res.redirect('/dashboard');
        }

        res.render(config.view, { 
            user: req.user, 
            lessonId: id,
            courseType: course,
            lesson: correctLessonData,
            lessonData: correctLessonData 
        });
    } catch (err) {
        console.error("❌ JSON/Search Error:", err.message);
        res.redirect('/dashboard');
    }
});

// --- Handlers ---
app.use((req, res) => res.status(404).redirect('/dashboard'));
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).send('Something went wrong.');
});

// 🚀 CREATE HTTP SERVER 🚀
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// 🎤 ATTACH THE REAL WEBSOCKET SERVER (Connecting Proxy!) 🎤
attachLiveVoiceProxy(server); 

server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

module.exports = app;