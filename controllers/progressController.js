const fs = require('fs');
const path = require('path');
const User = require('../models/User'); 

/**
 * @desc    Mark a lesson as complete, unlock the next one, & award XP/Streak
 * @route   POST /api/progress/complete
 * @access  Private
 */
exports.markLessonComplete = async (req, res) => {
    try {
        const { lessonId, courseType = 'accounting' } = req.body; 
        const userId = req.user.id || req.user._id; 
        const lessonNumber = parseInt(lessonId);

        const user = await User.findById(userId);

        // 🏗️ Safety: Ensure the progress sub-object exists for the course
        if (!user.progress[courseType]) {
            user.progress[courseType] = { completedLessons: [], lastUnlockedLesson: 1 };
        }

        let xpGained = 0;
        let isNewCompletion = false;

        // 1. Mark current lesson as complete & Add XP
        if (!user.progress[courseType].completedLessons.includes(lessonNumber)) {
            user.progress[courseType].completedLessons.push(lessonNumber);
            
            // 🎮 GAMIFICATION: Naya lesson complete karne par +20 XP do!
            xpGained = 20;
            user.xp = (user.xp || 0) + xpGained;
            isNewCompletion = true;
        }

        // 2. Unlock logic (Accounting: 40 lessons, English: 30 sessions)
        const limit = courseType === 'accounting' ? 40 : 30;
        const nextLesson = lessonNumber + 1;
        
        if (user.progress[courseType].lastUnlockedLesson < nextLesson && nextLesson <= limit) {
            user.progress[courseType].lastUnlockedLesson = nextLesson;
        }

        // 🎮 GAMIFICATION: STREAK LOGIC (Duolingo Style)
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        if (!user.streak.lastActive) {
            // First time ever
            user.streak.current = 1;
        } else {
            const lastActiveDate = new Date(user.streak.lastActive);
            const lastActiveDay = new Date(lastActiveDate.getFullYear(), lastActiveDate.getMonth(), lastActiveDate.getDate()).getTime();
            const oneDay = 24 * 60 * 60 * 1000;

            if (today - lastActiveDay === oneDay) {
                // Kal padha tha, aaj bhi padha -> Streak badhao!
                user.streak.current += 1;
            } else if (today - lastActiveDay > oneDay) {
                // Gap kar diya -> Streak toot gayi, wapas 1 se shuru!
                user.streak.current = 1;
            }
            // Agar same day pe multiple lessons kiye hain, toh streak utni hi rahegi
        }
        // Update last active time to right now
        user.streak.lastActive = now;


        // Save all changes to Database
        user.markModified('progress'); 
        await user.save(); 

        console.log(`✅ Progress: [${courseType.toUpperCase()}] L${lessonNumber} complete. Next: ${user.progress[courseType].lastUnlockedLesson}. XP: ${user.xp}, Streak: ${user.streak.current}`);

        res.status(200).json({ 
            success: true, 
            message: xpGained > 0 ? `Progression sauvegardée ! +${xpGained} XP gagné 🌟` : 'Progression sauvegardée !',
            nextLesson: user.progress[courseType].lastUnlockedLesson,
            xpGained: xpGained,
            totalXp: user.xp,
            currentStreak: user.streak.current
        });
    } catch (error) {
        console.error("Mark Complete Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Load Dashboard with Dual-Track data from separate folders
 * @route   GET /dashboard
 * @access  Private
 */
exports.getDashboard = async (req, res) => {
    try {
        const accountingPath = path.join(__dirname, '../data');
        const englishPath = path.join(__dirname, '../data/english');
        
        let accountingLessons = [];
        let englishLessons = [];

        const user = await User.findById(req.user.id || req.user._id);

        // --- 🛡️ Safety Check: Initialize progress if missing ---
        if (!user.progress.accounting) user.progress.accounting = { completedLessons: [], lastUnlockedLesson: 1 };
        if (!user.progress.english) user.progress.english = { completedLessons: [], lastUnlockedLesson: 1 };

        // --- 🎮 Auto-Reset Dead Streak on Dashboard Load ---
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (user.streak && user.streak.lastActive) {
            const lastActiveDate = new Date(user.streak.lastActive);
            const lastActiveDay = new Date(lastActiveDate.getFullYear(), lastActiveDate.getMonth(), lastActiveDate.getDate()).getTime();
            const oneDay = 24 * 60 * 60 * 1000;
            
            // Agar user dashboard pe aaya hai par 1 din se zyada ho gaya hai
            if (today - lastActiveDay > oneDay && user.streak.current > 0) {
                user.streak.current = 0; // Streak reset ho jayegi UI pe dikhane ke liye
                await user.save();
            }
        }

        // --- 💼 Part 1: Load Accounting Lessons (from /data) ---
        if (fs.existsSync(accountingPath)) {
            const files = fs.readdirSync(accountingPath);
            files.forEach(file => {
                if (file.startsWith('lesson') && file.endsWith('.json')) {
                    try { 
                        const rawData = fs.readFileSync(path.join(accountingPath, file));
                        const data = JSON.parse(rawData);
                        
                        const lessonNum = parseInt(file.replace('lesson', '').replace('.json', ''));
                        
                        accountingLessons.push({
                            id: lessonNum,
                            title: data.title?.fr || data.title || `Leçon ${lessonNum}`,
                            description: data.content?.fr?.objectif?.substring(0, 70) + '...' || "Maîtrisez la comptabilité...",
                            isUnlocked: lessonNum <= user.progress.accounting.lastUnlockedLesson,
                            isCompleted: user.progress.accounting.completedLessons.includes(lessonNum),
                            imageUrl: data.imageUrl || null
                        });
                    } catch (err) {
                        console.error(`⚠️ Attention: Fichier JSON corrompu ou vide ignoré -> /data/${file}`);
                    }
                }
            });
        }

        // --- 🇬🇧 Part 2: Load English Lessons (from /data/english) ---
        if (fs.existsSync(englishPath)) {
            const files = fs.readdirSync(englishPath);
            files.forEach(file => {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { 
                        const rawData = fs.readFileSync(path.join(englishPath, file));
                        const data = JSON.parse(rawData);
                        
                        const lessonNum = parseInt(file.replace('phase', '').replace('.json', ''));
                        
                        englishLessons.push({
                            id: lessonNum,
                            title: data.title || `English Phase ${lessonNum}`,
                            description: data.description || "Maîtrisez l'anglais pas à pas...",
                            isUnlocked: lessonNum <= user.progress.english.lastUnlockedLesson,
                            isCompleted: user.progress.english.completedLessons.includes(lessonNum),
                            imageUrl: data.imageUrl || null
                        });
                    } catch (err) {
                        console.error(`⚠️ Attention: Fichier JSON corrompu ou vide ignoré -> /data/english/${file}`);
                    }
                }
            });
        }

        // Sort both arrays numerically
        accountingLessons.sort((a, b) => a.id - b.id);
        englishLessons.sort((a, b) => a.id - b.id);

        // Final Rendering
        res.render('pages/dashboard', { 
            user: user, // 🚀 Ye ab user ka 'xp' aur 'streak' bhi UI me bhejega!
            accountingLessons: accountingLessons,
            englishLessons: englishLessons
        });

    } catch (error) {
        console.error("Dashboard Loading Error:", error);
        res.redirect('/');
    }
};