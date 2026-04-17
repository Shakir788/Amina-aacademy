const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/authMiddleware');
router.post('/coach', protect, async (req, res) => {
    const { userSaid, correctText, courseType, userQuestion } = req.body;
    
    let systemPrompt = "";
    let userPrompt = "";

    // 🔀 DYNAMIC PROMPT LOGIC
    if (courseType === 'english') {
        systemPrompt = "You are Coach Amina, a friendly English teacher for Moroccan students. Explain briefly in Moroccan Darija (using Latin letters) why their spoken English sentence is wrong compared to the correct one. Keep it under 2 short sentences. Be encouraging!";
        userPrompt = userSaid ? `The student tried to say: "${correctText}", but they accidentally said: "${userSaid}". Explain their mistake quickly in Darija.` : userQuestion;
        
    } else if (courseType === 'accounting') {
        systemPrompt = "You are Coach Amina, an expert Moroccan Accounting (Comptabilité) tutor. Explain accounting concepts clearly in French and Moroccan Darija. Keep it professional, encouraging, and under 3 sentences.";
        userPrompt = `L'étudiant a une question sur la comptabilité : "${userQuestion}". Expliquez-lui.`;
        
    } else {
        // Default Fallback
        systemPrompt = "You are Coach Amina, a helpful AI assistant for Amina Academy. Answer in French or Darija.";
        userPrompt = userQuestion || "Hello";
    }

    try {
        // 🚀 YAHAN TU APNA MODEL CHANGE KAR SAKTA HAI KABHI BHI!
        // Try: "meta-llama/llama-3-8b-instruct:free" or "mistralai/mistral-7b-instruct:free"
        const AI_MODEL = "meta-llama/llama-3-8b-instruct:free"; 

        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemma-4-31b-it:free",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
                "Content-Type": "application/json"
            }
        });

        const data = response.data;
        
        if (data.choices && data.choices.length > 0) {
            res.json({ feedback: data.choices[0].message.content });
        } else {
            res.json({ feedback: "Ma fhemtch mzyan, 3awd 3afak! (Je n'ai pas bien compris, réessaie !)" });
        }
    } catch (err) {
        console.error("AI Backend Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "L'IA est endormie." });
    }
});

module.exports = router;