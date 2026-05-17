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

        // 🏗️ Safety: Ensure the progress sub-object exists for ANY course
        if (!user.progress[courseType]) {
            user.progress[courseType] = { completedLessons: [], lastUnlockedLesson: 1 };
        }

        let xpGained = 0;
        let isNewCompletion = false;

        // 1. Mark current lesson as complete & Add XP
        if (!user.progress[courseType].completedLessons.includes(lessonNumber)) {
            user.progress[courseType].completedLessons.push(lessonNumber);
            
            // 🎮 GAMIFICATION: XP Logic
            // Marketing missions pe thoda zyada XP dete hain taaki motivation rahe
            xpGained = courseType === 'marketing' ? 30 : 20; 
            user.xp = (user.xp || 0) + xpGained;
            isNewCompletion = true;
        }

        // 2. Unlock logic (Accounting: 40, English: 30, Marketing: 20)
        let limit = 30;
        if (courseType === 'accounting') limit = 40;
        if (courseType === 'marketing') limit = 20;

        const nextLesson = lessonNumber + 1;
        
        if (user.progress[courseType].lastUnlockedLesson < nextLesson && nextLesson <= limit) {
            user.progress[courseType].lastUnlockedLesson = nextLesson;
        }

        // 🎮 GAMIFICATION: STREAK LOGIC (Duolingo Style)
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        if (!user.streak.lastActive) {
            user.streak.current = 1;
        } else {
            const lastActiveDate = new Date(user.streak.lastActive);
            const lastActiveDay = new Date(lastActiveDate.getFullYear(), lastActiveDate.getMonth(), lastActiveDate.getDate()).getTime();
            const oneDay = 24 * 60 * 60 * 1000;

            if (today - lastActiveDay === oneDay) {
                user.streak.current += 1;
            } else if (today - lastActiveDay > oneDay) {
                user.streak.current = 1; // Gap ho gaya
            }
        }
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
 * @desc    Load Dashboard with Multi-Track data from separate folders
 * @route   GET /dashboard
 * @access  Private
 */
exports.getDashboard = async (req, res) => {
    try {
        const accountingPath = path.join(__dirname, '../data');
        const englishPath = path.join(__dirname, '../data/english');
        const marketingPath = path.join(__dirname, '../data/marketing'); // 🚀 NEW MARKETING PATH
        
        let accountingLessons = [];
        let englishLessons = [];
        let marketingLessons = []; // 🚀 NEW ARRAY

        const user = await User.findById(req.user.id || req.user._id);

        // --- 🛡️ Safety Check: Initialize progress if missing ---
        if (!user.progress.accounting) user.progress.accounting = { completedLessons: [], lastUnlockedLesson: 1 };
        if (!user.progress.english) user.progress.english = { completedLessons: [], lastUnlockedLesson: 1 };
        if (!user.progress.marketing) user.progress.marketing = { completedLessons: [], lastUnlockedLesson: 1 }; // 🚀 INIT MARKETING

        // --- 🎮 Auto-Reset Dead Streak on Dashboard Load ---
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (user.streak && user.streak.lastActive) {
            const lastActiveDate = new Date(user.streak.lastActive);
            const lastActiveDay = new Date(lastActiveDate.getFullYear(), lastActiveDate.getMonth(), lastActiveDate.getDate()).getTime();
            const oneDay = 24 * 60 * 60 * 1000;
            
            if (today - lastActiveDay > oneDay && user.streak.current > 0) {
                user.streak.current = 0; 
                await user.save();
            }
        }

        // --- 💼 Part 1: Load Accounting Lessons ---
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
                    } catch (err) { }
                }
            });
        }

        // --- 🇬🇧 Part 2: Load English Lessons ---
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
                    } catch (err) { }
                }
            });
        }

       // --- 📱 Part 3: Load Marketing Lessons (GOD MODE) ---
        if (fs.existsSync(marketingPath)) {
            const files = fs.readdirSync(marketingPath);
            files.forEach(file => {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { 
                        const rawData = fs.readFileSync(path.join(marketingPath, file));
                        const data = JSON.parse(rawData);
                        const phaseNum = parseInt(file.replace('phase', '').replace('.json', ''));
                        
                        // 🧠 Extract Title and Description from the Root of Phase JSON
                        let mktTitle = typeof data.title === 'object' ? (data.title.fr || data.title.en) : data.title;
                        let mktDesc = typeof data.description === 'object' ? (data.description.fr || data.description.en) : data.description;
                        
                        marketingLessons.push({
                            id: phaseNum, // Phase 1 = ID 1
                            title: mktTitle || `Phase Marketing ${phaseNum}`,
                            description: mktDesc ? mktDesc.substring(0, 75) + '...' : "Découvrez les secrets du marketing...",
                            isUnlocked: phaseNum <= user.progress.marketing.lastUnlockedLesson,
                            isCompleted: user.progress.marketing.completedLessons.includes(phaseNum),
                            imageUrl: data.imageUrl || null
                        });
                    } catch (err) { 
                        console.error(`⚠️ Erreur Marketing JSON: ${file}`);
                    }
                }
            });
        }
        // Sort all arrays numerically
        accountingLessons.sort((a, b) => a.id - b.id);
        englishLessons.sort((a, b) => a.id - b.id);
        marketingLessons.sort((a, b) => a.id - b.id);

        // Final Rendering
        res.render('pages/dashboard', { 
            user: user,
            accountingLessons: accountingLessons,
            englishLessons: englishLessons,
            marketingLessons: marketingLessons // 🚀 Asli data bhej diya dashboard ko!
        });

    } catch (error) {
        console.error("Dashboard Loading Error:", error);
        res.redirect('/');
    }
};