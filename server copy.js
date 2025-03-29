// server.js
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

app.post('/chat', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-002", // ใช้โมเดลเวอร์ชันล่าสุด
            apiVersion: "v1" // ระบุเวอร์ชัน API
        });
        
        const result = await model.generateContent(req.body.message);
        const response = await result.response;
        const text = response.text();

        res.json({ response: text });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ 
            error: "เกิดข้อผิดพลาดในการประมวลผล",
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`เซิร์ฟเวอร์ทำงานที่ http://localhost:${port}`);
});