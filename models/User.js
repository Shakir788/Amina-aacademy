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
        // Password sirf tab required hoga agar user Google se nahi aaya
        required: function() {
            return !this.googleId;
        }, 
        select: false 
    },
    
    // 🚀 Google OAuth & Profile Flow
    googleId: {
        type: String,
        unique: true,
        sparse: true 
    },
    isProfileComplete: {
        type: Boolean,
        default: false 
    },

    // 🏗️ NAYA: Multi-Course Progress System
    // Ab hum har course ki progress alag-alag track karenge
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

    
    preferences: {
        language: { type: String, default: 'fr' }, 
        goal: { type: String } 
    }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);