require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); 
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios'); 

const connectDB = require('./config/db.js');
const User = require('./models/User'); 

// --- Imports ---
const authRoutes = require('./routes/authRoutes');
const progressRoutes = require('./routes/progressRoutes');
const aiRoutes = require('./routes/aiRoutes'); 
const { protect } = require('./middleware/authMiddleware');
const { getDashboard } = require('./controllers/progressController');

// Database Connection
connectDB();

const app = express();

// 🚀 VERCEL FIX: Trust proxy for secure sessions
app.set('trust proxy', 1); 

// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// 🚀 Session Setup (Optimized for Production)
app.use(session({
    secret: process.env.JWT_SECRET || 'amina_secret_key',
    resave: true, 
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// --- Passport.js Setup ---
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

// 🛡️ Security: Cache-Control
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '-1');
    next();
});

// --- View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- API Routes ---
app.use('/api/auth', authRoutes); 
app.use('/api/progress', progressRoutes); 
app.use('/api/ai', aiRoutes); 

// --- Page Routes ---
app.get('/', (req, res) => res.render('index'));
app.get('/register', (req, res) => res.render('pages/register'));
app.get('/login', (req, res) => res.render('pages/login'));
app.get('/complete-profile', protect, (req, res) => {
    res.render('pages/complete-profile', { user: req.user });
});

app.get('/dashboard', protect, getDashboard);

// 🚀 BACKWARD COMPATIBILITY: Purane accounting links ko naye route pe bhej do
app.get('/lesson/:id', protect, (req, res) => {
    res.redirect(`/lesson/accounting/${req.params.id}`);
});

// 🚀 SMART MULTI-COURSE ROUTE (Accounting & English)
app.get('/lesson/:course/:id', protect, (req, res) => {
    const { course, id } = req.params;
    
    // Check if course is English or Accounting to set folder path
    let folder = 'data'; 
    if (course === 'english') folder = 'data/english';
    else if (course === 'accounting' || course === 'accountant') folder = 'data/accounting';

    const fileName = course === 'english' ? `phase${id}.json` : `lesson${id}.json`;
    
    let filePath = path.join(__dirname, folder, fileName);

    // Agar data/accounting folder me nahi mila, toh direct data/ me check karo (Tree structure fix)
    if (!fs.existsSync(filePath) && course !== 'english') {
        filePath = path.join(__dirname, 'data', fileName); 
    }

    if (fs.existsSync(filePath)) {
        try {
            const rawData = fs.readFileSync(filePath);
            const parsedData = JSON.parse(rawData);
            
            // SMART ROUTING: Decide which EJS file to render based on the course
            const viewFile = course === 'english' ? 'pages/lesson-english' : 'pages/lesson';
            
            res.render(viewFile, { 
                user: req.user, 
                lessonId: id,
                courseType: course,
                // 🚀 THE FIX: Dono naam bhej diye, English 'lesson' use karega, Accounting 'lessonData'
                lesson: parsedData,
                lessonData: parsedData 
            });
        } catch (err) {
            console.error("File Read Error:", err);
            res.redirect('/dashboard');
        }
    } else {
        console.error("❌ File not found at:", filePath);
        res.redirect('/dashboard');
    }
});

// --- Server & Vercel Export ---
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;