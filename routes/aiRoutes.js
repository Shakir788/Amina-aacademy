const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/authMiddleware');

// ==========================================
// 1. TEXT GENERATION ROUTE (Amina's Brain)
// ==========================================
router.post('/coach', protect, async (req, res) => {
    const { userSaid, correctText, courseType, userQuestion } = req.body;
    
    let systemPrompt = "";
    let userPrompt = "";

    // 🔀 DYNAMIC MASTER PROMPTS
    if (courseType === 'english') {
        systemPrompt = `You are Amina, a hilarious, friendly, and slightly sarcastic English teacher for Moroccan students.
        Rules:
        1. Explain English mistakes in Moroccan Darija (Latin letters).
        2. Be funny! Use jokes or dramatic reactions (like a typical Moroccan friend) but keep it encouraging.
        3. Keep it short (2-3 sentences).
        4. GUARDRAIL: You ONLY teach English. If they ask about Accounting, Math, or anything else, playfully scold them in Darija and say "We are in English class, focus!"`;
        
        userPrompt = userSaid 
            ? `Student made a mistake. They wanted to say: "${correctText}", but said: "${userSaid}". Explain the mistake in a funny way using Darija.` 
            : `Student question: "${userQuestion}". Answer them helpfully and funnily in Darija.`;
            
    } else if (courseType === 'accounting') {
        systemPrompt = `You are Amina, an expert Accounting (Comptabilité) tutor for Moroccan students.
        Rules:
        1. Use a mix of French (for accounting terms) and Moroccan Darija (for friendly explanations).
        2. Add a slight touch of humor so it's not boring.
        3. ALWAYS give a simple, relatable real-life Moroccan example (e.g., a Moul Lhanout, a local cafe, a taxi driver).
        4. Keep it concise (max 3-4 sentences).
        5. GUARDRAIL: You ONLY teach Accounting. If they ask about English or general knowledge, politely say "Ana prof dyal la compta, mashi anglais! (I am an accounting teacher, not English!)" and redirect them.`;
        
        userPrompt = `L'étudiant a une question de comptabilité : "${userQuestion}". Explique-lui avec un exemple marocain.`;
        
    } else {
        // Default Fallback
        systemPrompt = "You are Amina, a funny and helpful AI assistant for Amina Academy. Answer in a mix of French and Moroccan Darija.";
        userPrompt = userQuestion || "Salut Amina!";
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await axios.post(url, {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: 0.8, 
                maxOutputTokens: 250
            }
        }, { headers: { "Content-Type": "application/json" } });

        const data = response.data;
        
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            res.json({ feedback: aiText });
        } else {
            res.json({ feedback: "Wili wili, ma fhemtch! 3awd 3afak 😂 (Je n'ai pas bien compris, réessaie !)" });
        }
    } catch (err) {
        console.error("AI Backend Error:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
        res.status(500).json({ error: "Amina mchat techreb atay. (L'IA est endormie)." });
    }
});


// ==========================================
// 2. VOICE GENERATION ROUTE (Amina's Voice) 🎙️
// ==========================================
router.post('/speak', protect, async (req, res) => {
    const { text, courseType } = req.body;

    if (!text) return res.status(400).json({ error: "Text is required" });

    // 🎙️ Dynamic Voice Selection
    let languageCode = 'fr-FR';
    let voiceName = 'fr-FR-Neural2-A'; 

    if (courseType === 'english') {
        languageCode = 'en-US';
        voiceName = 'en-US-Journey-F'; 
    }

    try {
        const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GEMINI_API_KEY}`;

        const response = await axios.post(ttsUrl, {
            input: { text: text },
            voice: { 
                languageCode: languageCode, 
                name: voiceName 
            },
            audioConfig: { 
                audioEncoding: 'MP3',
                speakingRate: 1.05 
            }
        });

        res.json({ audioContent: response.data.audioContent });

    } catch (err) {
        console.error("TTS API Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "Voice module is sleeping." });
    }
});


// ==========================================
// 3. LIVE VOICE WEBSOCKET TOKEN ROUTE 🚀
// ==========================================
router.get('/live-token', protect, (req, res) => {
    // Ye route Vercel ko bypass karke direct Google se connect karne ka "Pass" dega
    try {
        // 🔴 YAHAN FIX KIYA HAI: v1alpha ki jagah v1beta kar diya
        const wsUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
        
        res.json({ 
            success: true,
            url: wsUrl,
            key: process.env.GEMINI_API_KEY 
        });
    } catch (error) {
        console.error("Token Generation Error:", error);
        res.status(500).json({ error: "Failed to generate live pass." });
    }
});

module.exports = router;