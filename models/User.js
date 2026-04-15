const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
        // 👇 Password sirf tab required hoga agar user Google se nahi aaya
        required: function() {
            return !this.googleId;
        }, 
        select: false 
    },
    
    // 🚀 NAYA: Google OAuth & Profile Flow
    googleId: {
        type: String,
        unique: true,
        sparse: true // Jin users ke paas ye nahi hoga, unko error aane se rokega
    },
    isProfileComplete: {
        type: Boolean,
        default: false // Jab naya user Google se aayega, ye false rahega
    },

    // 👇 Purana Progress wala section
    progress: {
        completedLessons: {
            type: [Number],
            default: []
        },
        lastUnlockedLesson: {
            type: Number,
            default: 1
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);