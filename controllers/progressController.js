const fs = require('fs');
const path = require('path');
const User = require('../models/User'); 

/**
 * @desc    Mark a lesson as complete & unlock the next one
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

        // 1. Mark current lesson as complete
        if (!user.progress[courseType].completedLessons.includes(lessonNumber)) {
            user.progress[courseType].completedLessons.push(lessonNumber);
        }

        // 2. Unlock logic (Accounting: 40 lessons, English: 30 sessions)
        const limit = courseType === 'accounting' ? 40 : 30;
        const nextLesson = lessonNumber + 1;
        
        if (user.progress[courseType].lastUnlockedLesson < nextLesson && nextLesson <= limit) {
            user.progress[courseType].lastUnlockedLesson = nextLesson;
        }

        // Save to Database
        user.markModified('progress'); 
        await user.save(); 

        console.log(`✅ Progress Updated: [${courseType.toUpperCase()}] Lesson ${lessonNumber} complete. Next: ${user.progress[courseType].lastUnlockedLesson}`);

        res.status(200).json({ 
            success: true, 
            message: 'Progression sauvegardée !',
            nextLesson: user.progress[courseType].lastUnlockedLesson 
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

        // --- 💼 Part 1: Load Accounting Lessons (from /data) ---
        if (fs.existsSync(accountingPath)) {
            const files = fs.readdirSync(accountingPath);
            files.forEach(file => {
                // Accounting files: "lesson1.json", "lesson2.json", etc.
                if (file.startsWith('lesson') && file.endsWith('.json')) {
                    try { // 🚀 BULLETPROOF: Try-Catch prevents crashes from empty JSONs
                        const rawData = fs.readFileSync(path.join(accountingPath, file));
                        const data = JSON.parse(rawData);
                        
                        // Extract ID from filename: "lesson5.json" -> 5
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
                // 🚀 NAYA: English files ab "phase1.json", "phase2.json" style me hain
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { // 🚀 BULLETPROOF: Try-Catch protects English section too
                        const rawData = fs.readFileSync(path.join(englishPath, file));
                        const data = JSON.parse(rawData);
                        
                        // Extract ID from filename: "phase1.json" -> 1
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
            user: user,
            accountingLessons: accountingLessons,
            englishLessons: englishLessons
        });

    } catch (error) {
        console.error("Dashboard Loading Error:", error);
        res.redirect('/');
    }
};