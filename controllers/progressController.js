const fs = require('fs');
const path = require('path');
const User = require('../models/User'); 

// @desc    Mark a lesson as complete and unlock the next one
// @route   POST /api/progress/complete
exports.markLessonComplete = async (req, res) => {
    try {
        const { lessonId } = req.body;
        const userId = req.user.id || req.user._id; 
        const lessonNumber = parseInt(lessonId);

        const user = await User.findById(userId);

        if (!user.progress) {
            user.progress = { completedLessons: [], lastUnlockedLesson: 1 };
        }

        // 1. Mark as complete
        if (!user.progress.completedLessons.includes(lessonNumber)) {
            user.progress.completedLessons.push(lessonNumber);
        }

        // 2. Unlock next lesson (Up to 40)
        const nextLesson = lessonNumber + 1;
        if (user.progress.lastUnlockedLesson < nextLesson && nextLesson <= 40) {
            user.progress.lastUnlockedLesson = nextLesson;
        }

        user.markModified('progress'); 
        await user.save(); 

        // 🚨 DEBUG LOG: Ye tere terminal me print hoga
        console.log(`✅ DB UPDATED! User ab Lesson ${user.progress.lastUnlockedLesson} tak ja sakta hai.`);
        console.log(`📚 Completed Lessons Array:`, user.progress.completedLessons);

        res.status(200).json({ success: true, message: 'Leçon terminée !' });
    } catch (error) {
        console.error("Mark Complete Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Load Dashboard and Lessons with Real Progress
// @route   GET /dashboard
exports.getDashboard = async (req, res) => {
    try {
        const dataPath = path.join(__dirname, '../data');
        let availableLessons = [];

        const user = await User.findById(req.user.id || req.user._id);
        
        const lastUnlocked = user.progress?.lastUnlockedLesson || 1; 
        const completedLessons = user.progress?.completedLessons || []; 

        if (fs.existsSync(dataPath)) {
            const files = fs.readdirSync(dataPath);
            
            files.forEach(file => {
                if (file.endsWith('.json') && file.startsWith('lesson')) {
                    const rawData = fs.readFileSync(path.join(dataPath, file));
                    const lessonData = JSON.parse(rawData);
                    
                    // 🔥 BULLETPROOF FIX: JSON ke andar ki id chhod, File ke naam se number nikaal!
                    // Example: "lesson12.json" -> "12"
                    const extractedId = file.replace('lesson', '').replace('.json', '');
                    const lessonNum = parseInt(extractedId);

                    const isUnlocked = lessonNum <= lastUnlocked;
                    const isCompleted = completedLessons.includes(lessonNum);

                    const lessonTitle = lessonData.title && lessonData.title.fr ? lessonData.title.fr : `Leçon ${lessonNum}`;
                    const lessonObj = lessonData.content && lessonData.content.fr ? lessonData.content.fr.objectif : "";
                    const descriptionText = lessonObj ? lessonObj.substring(0, 70) + '...' : 'Description courte...';

                    availableLessons.push({
                        id: lessonNum,
                        title: lessonTitle,
                        description: descriptionText,
                        isUnlocked: isUnlocked,
                        isCompleted: isCompleted,
                        imageIndex: (lessonNum % 10) + 1 
                    });
                }
            });

            availableLessons.sort((a, b) => a.id - b.id);
        }

        // 👇 NAYI LINE: X-Ray Vision check karne ke liye ki Dashboard ko kya data ja raha hai
        console.log("👀 Dashboard Data Check -> Lesson 2 Unlocked?:", availableLessons.find(l => l.id === 2)?.isUnlocked);

        res.render('pages/dashboard', { 
            user: req.user,
            lessons: availableLessons 
        });

    } catch (error) {
        console.error("Dashboard Loading Error:", error);
        res.redirect('/');
    }
};