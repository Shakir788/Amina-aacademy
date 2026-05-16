const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // 1. Basic Identity
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        // Password sirf tab required hoga agar user Google se nahi aaya
        required: function() {
            return !this.googleId;
        }, 
        select: false 
    },
    
    // 2. Google OAuth & Profile Flow 🚀
    googleId: {
        type: String,
        unique: true,
        sparse: true 
    },
    isProfileComplete: {
        type: Boolean,
        default: false 
    },

    // 3. Gamification Engine (Duolingo Style 🎮) [NAYA]
    xp: {
        type: Number,
        default: 0
    },
    streak: {
        current: { type: Number, default: 0 },
        lastActive: { type: Date, default: null }
    },

    // 4. Multi-Course Progress System 🏗️
    progress: {
        accounting: {
            completedLessons: {
                type: [Number],
                default: []
            },
            lastUnlockedLesson: {
                type: Number,
                default: 1
            }
        },
        english: {
            completedLessons: {
                type: [Number],
                default: []
            },
            lastUnlockedLesson: {
                type: Number,
                default: 1
            }
        }
    },
    
    // 5. User Preferences
    preferences: {
        language: { type: String, default: 'fr' }, // fr, en, ar (Darija)
        goal: { type: String } 
    },

    // 6. SaaS Monetization & Roles 💰 [NAYA]
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'premium'],
            default: 'free'
        },
        expiresAt: {
            type: Date,
            default: null
        }
    },
    role: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student'
    }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);