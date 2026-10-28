const fs = require('fs');
const path = require('path');
const User = require('../models/User'); 

/**
 * @desc    Mark a lesson as complete, unlock the next one, & award XP/Streak
 * @route   POST /api/progress/complete
 * @access  Private
 */
// ---- Real lesson IDs data folders se padho ----
const ALLOWED_COURSES = ['accounting', 'english', 'marketing'];
const COURSE_IDS = {};

const getCourseIds = (course) => {
    if (COURSE_IDS[course]) return COURSE_IDS[course];
    const folder = path.join(__dirname, '../data', course);
    const ids = new Set();
    if (fs.existsSync(folder)) {
        for (const file of fs.readdirSync(folder)) {
            if (!file.startsWith('phase') || !file.endsWith('.json')) continue;
            try {
                const parsed = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
                const list = Array.isArray(parsed) ? parsed : (parsed.lessons || [parsed]);
                list.forEach(l => { if (Number.isInteger(Number(l.id))) ids.add(Number(l.id)); });
            } catch (e) {}
        }
    }
    COURSE_IDS[course] = [...ids].sort((a, b) => a - b);
    return COURSE_IDS[course];
};

const nextLessonId = (course, current) => getCourseIds(course).find(id => id > current) || null;

exports.markLessonComplete = async (req, res) => {
    try {
        const { lessonId, courseType = 'accounting' } = req.body;

        if (!ALLOWED_COURSES.includes(courseType)) {
            return res.status(400).json({ success: false, message: 'Cours invalide' });
        }

        const lessonNumber = parseInt(lessonId);
        if (!getCourseIds(courseType).includes(lessonNumber)) {
            return res.status(400).json({ success: false, message: 'Leçon invalide' });
        }

        const user = await User.findById(req.user.id || req.user._id);

        if (!user.progress[courseType]) {
            user.progress[courseType] = { completedLessons: [], lastUnlockedLesson: 1 };
        }

        // Locked lesson ko complete karke XP farm nahi kar sakte
        if (lessonNumber > user.progress[courseType].lastUnlockedLesson) {
            return res.status(403).json({ success: false, message: 'Leçon verrouillée' });
        }

        
        // Pacing: roz sirf 2 naye lessons (sab courses mila ke)
        const DAILY_NEW_LIMIT = 2;
        const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
        if (!user.dailyNew || user.dailyNew.day !== todayKey) {
            user.dailyNew = { day: todayKey, count: 0 };
        }
        const isNew = !user.progress[courseType].completedLessons.includes(lessonNumber);
        if (isNew && user.dailyNew.count >= DAILY_NEW_LIMIT) {
            return res.status(429).json({
                success: false,
                limitDaily: true,
                message: "Limite du jour atteinte : 2 nouvelles leçons par jour. Reviens demain !"
            });
        }
        if (isNew) user.dailyNew.count += 1;

        let xpGained = 0;

        if (!user.progress[courseType].completedLessons.includes(lessonNumber)) {
            user.progress[courseType].completedLessons.push(lessonNumber);
            xpGained = courseType === 'marketing' ? 30 : 20;
            user.xp = (user.xp || 0) + xpGained;
        }

        // Next lesson unlock (gaps bhi handle hote hain)
        const next = nextLessonId(courseType, lessonNumber);
        if (next && user.progress[courseType].lastUnlockedLesson < next) {
            user.progress[courseType].lastUnlockedLesson = next;
        }

        // Streak
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const oneDay = 24 * 60 * 60 * 1000;

        if (!user.streak.lastActive) {
            user.streak.current = 1;
        } else {
            const last = new Date(user.streak.lastActive);
            const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
            if (today - lastDay === oneDay) user.streak.current += 1;
            else if (today - lastDay > oneDay) user.streak.current = 1;
        }
        user.streak.lastActive = now;

        user.markModified('progress');
        await user.save();

        res.status(200).json({
            success: true,
            message: xpGained > 0 ? `Progression sauvegardée ! +${xpGained} XP gagné 🌟` : 'Progression sauvegardée !',
            nextLesson: user.progress[courseType].lastUnlockedLesson,
            xpGained,
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
        const accountingPath = path.join(__dirname, '../data/accounting');
        const englishPath = path.join(__dirname, '../data/english');
        const marketingPath = path.join(__dirname, '../data/marketing'); 
        
        let accountingLessons = [];
        let englishLessons = [];
        let marketingLessons = []; 

        const user = await User.findById(req.user.id || req.user._id);

        // --- 🛡️ Safety Check: Initialize progress if missing ---
        if (!user.progress.accounting) user.progress.accounting = { completedLessons: [], lastUnlockedLesson: 1 };
        if (!user.progress.english) user.progress.english = { completedLessons: [], lastUnlockedLesson: 1 };
        if (!user.progress.marketing) user.progress.marketing = { completedLessons: [], lastUnlockedLesson: 1 };

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

        // 🛠️ Helper function to parse Phase files correctly
        const parsePhaseData = (filePath, fileNumber, lastUnlocked, completedArr) => {
            const rawData = fs.readFileSync(filePath);
            const data = JSON.parse(rawData);
            
            let firstLessonId = fileNumber;
            let lastLessonId = fileNumber;
            let title = `Phase ${fileNumber}`;
            let desc = "Continuez votre apprentissage...";
            let image = null;

            if (Array.isArray(data) && data.length > 0) {
                firstLessonId = data[0].id;
                lastLessonId = data[data.length - 1].id;
                title = data[0].title;
                if (typeof title === 'object') title = title.fr || title.en;
                if (data[0].content && data[0].content.fr && data[0].content.fr.objectif) desc = data[0].content.fr.objectif;
                image = data[0].imageUrl;
            } else if (!Array.isArray(data)) {
                firstLessonId = data.id || fileNumber;
                lastLessonId = firstLessonId;
                title = data.title;
                if (typeof title === 'object') title = title.fr || title.en;
                if (data.description) desc = typeof data.description === 'object' ? (data.description.fr || data.description.en) : data.description;
                else if (data.content && data.content.fr && data.content.fr.objectif) desc = data.content.fr.objectif;
                image = data.imageUrl;
            }

            return {
                id: firstLessonId, // Use exact lesson ID so links route correctly
                title: title || `Phase ${fileNumber}`,
                description: desc ? desc.substring(0, 70) + '...' : "...",
                isUnlocked: lastUnlocked >= firstLessonId,
                isCompleted: completedArr.includes(lastLessonId),
                imageUrl: image
            };
        };

        // --- 💼 Part 1: Load Accounting Lessons ---
        if (fs.existsSync(accountingPath)) {
            const files = fs.readdirSync(accountingPath);
            files.forEach(file => {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { 
                        const fileNum = parseInt(file.replace('phase', '').replace('.json', ''));
                        accountingLessons.push(parsePhaseData(
                            path.join(accountingPath, file), 
                            fileNum, 
                            user.progress.accounting.lastUnlockedLesson, 
                            user.progress.accounting.completedLessons
                        ));
                    } catch (err) { console.error(`⚠️ Error parsing Accounting file: ${file}`, err); }
                }
            });
        }

        // --- 🇬🇧 Part 2: Load English Lessons ---
        if (fs.existsSync(englishPath)) {
            const files = fs.readdirSync(englishPath);
            files.forEach(file => {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { 
                        const fileNum = parseInt(file.replace('phase', '').replace('.json', ''));
                        englishLessons.push(parsePhaseData(
                            path.join(englishPath, file), 
                            fileNum, 
                            user.progress.english.lastUnlockedLesson, 
                            user.progress.english.completedLessons
                        ));
                    } catch (err) {}
                }
            });
        }

       // --- 📱 Part 3: Load Marketing Lessons ---
        if (fs.existsSync(marketingPath)) {
            const files = fs.readdirSync(marketingPath);
            files.forEach(file => {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    try { 
                        const fileNum = parseInt(file.replace('phase', '').replace('.json', ''));
                        marketingLessons.push(parsePhaseData(
                            path.join(marketingPath, file), 
                            fileNum, 
                            user.progress.marketing.lastUnlockedLesson, 
                            user.progress.marketing.completedLessons
                        ));
                    } catch (err) { console.error(`⚠️ Erreur Marketing JSON: ${file}`); }
                }
            });
        }

        // Sort all arrays numerically by their first lesson ID
        accountingLessons.sort((a, b) => a.id - b.id);
        englishLessons.sort((a, b) => a.id - b.id);
        marketingLessons.sort((a, b) => a.id - b.id);

        // Final Rendering
        res.render('pages/dashboard', { 
            user: user,
            accountingLessons: accountingLessons,
            englishLessons: englishLessons,
            marketingLessons: marketingLessons 
        });

    } catch (error) {
        console.error("Dashboard Loading Error:", error);
        res.redirect('/');
    }
};

/**
 * @desc    Load Individual Lesson Page dynamically based on course type
 * @route   GET /lesson/:courseType/:id
 * @access  Private
 */
exports.getLessonPage = async (req, res) => {
    try {
        const courseType = req.params.courseType; // Example: 'accounting'
        const lessonId = req.params.id;           // Example: '4'
        const user = req.user;

        console.log(`\n🚀 [SMART SEARCH] Looking for Lesson ID: ${lessonId} in ${courseType}...`);

        const folderPath = path.join(__dirname, `../data/${courseType}`);
        let correctLessonData = null;

        // Sabhi phase files mein search karo
        if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath);
            
            for (const file of files) {
                if (file.startsWith('phase') && file.endsWith('.json')) {
                    const rawData = fs.readFileSync(path.join(folderPath, file));
                    const dataArray = JSON.parse(rawData);

                    // Agar file ke andar array hai (like phase1.json)
                    if (Array.isArray(dataArray)) {
                        const foundLesson = dataArray.find(l => String(l.id) === String(lessonId));
                        if (foundLesson) {
                            console.log(`✅ SUCCESS: Found Lesson ${lessonId} inside file: ${file}`);
                            // SIRF WAHI LESSON BHEJO, POORA ARRAY NAHI
                            correctLessonData = foundLesson; 
                            break; 
                        }
                    } else if (String(dataArray.id) === String(lessonId)) {
                        console.log(`✅ SUCCESS: Found Lesson ${lessonId} inside file: ${file}`);
                        correctLessonData = dataArray;
                        break;
                    }
                }
            }
        }

        // Agar kisi bhi file mein lesson nahi mila
        if (!correctLessonData) {
            console.error(`❌ ERROR: Lesson ID ${lessonId} kisi bhi JSON file mein nahi mila!`);
            return res.redirect('/dashboard');
        }

        // Render the correct EJS file
        res.render(`pages/${courseType}`, { 
            lesson: correctLessonData,
            lessonId: lessonId,
            courseType: courseType,
            user: user
        });

    } catch (error) {
        console.error("❌ Catch Error in getLessonPage:", error);
        res.redirect('/dashboard');
    }
};