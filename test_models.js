const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Note: listModels is not directly available on the client instance in some versions, 
        // but let's try a direct fetch or standard error to see what works.
        // Actually, the error message suggested calling ListModels.
        // In the Node SDK, we might just try 'gemini-1.0-pro' or 'gemini-1.5-flash-latest'
        
        // Let's try to just hit a known working model: gemini-1.5-flash
        // The previous error said 'gemini-1.5-flash' not found.
        // The error said 'gemini-pro' not found.
        
        console.log("Trying specific model names...");
        
        const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];
        
        for (const m of models) {
            console.log(`Testing: ${m}`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Hello");
                console.log(`SUCCESS: ${m} worked!`);
                return;
            } catch (e) {
                console.log(`FAILED: ${m} - ${e.message.split('\n')[0]}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

listModels();
