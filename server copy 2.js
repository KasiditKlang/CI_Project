require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const port = 3000;

// ตั้งค่าการอัปโหลดไฟล์
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('ไฟล์ประเภทนี้ไม่รองรับ'));
  }
}).single('file');

app.use(express.static('public'));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// ฟังก์ชันตรวจสอบ URL
function containsURL(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text ? text.match(urlRegex) : null;
}

app.post('/chat', async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ 
        error: "เกิดข้อผิดพลาดในการอัปโหลดไฟล์",
        details: err.message 
      });
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro-002",
        apiVersion: "v1"
      });

      let prompt = req.body.message || '';
      let contents = [];

      // ตรวจสอบและเพิ่ม URL
      const urls = containsURL(prompt);
      if (urls) {
        for (const url of urls) {
          contents.push({ text: `ลิงก์ที่ผู้ใช้แชร์: ${url}` });
        }
      }

      // ประมวลผลไฟล์ที่อัปโหลด
      if (req.file) {
        const filePath = req.file.path;
        const fileType = req.file.mimetype;

        if (fileType.startsWith('image/')) {
          const imageData = {
            inlineData: {
              data: fs.readFileSync(filePath).toString('base64'),
              mimeType: fileType
            }
          };
          contents.push(imageData);
        } 
        else if (fileType === 'application/pdf') {
          const dataBuffer = fs.readFileSync(filePath);
          const pdfData = await pdf(dataBuffer);
          contents.push({ text: `เนื้อหา PDF: ${pdfData.text}` });
        }
        else if (fileType.includes('wordprocessingml.document')) {
          const result = await mammoth.extractRawText({ path: filePath });
          contents.push({ text: `เนื้อหาเอกสาร: ${result.value}` });
        }
        else if (fileType === 'text/plain') {
          const textContent = fs.readFileSync(filePath, 'utf8');
          contents.push({ text: `เนื้อหาไฟล์ข้อความ: ${textContent}` });
        }

        // ลบไฟล์ชั่วคราว
        fs.unlinkSync(filePath);
      }

      // เพิ่มข้อความของผู้ใช้ถ้ามี
      if (prompt && !urls) {
        contents.push({ text: prompt });
      }

      const result = await model.generateContent({
        contents: [{ 
          role: "user",
          parts: contents
        }]
      });

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
});

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.listen(port, () => {
  console.log(`เซิร์ฟเวอร์ทำงานที่ http://localhost:${port}`);
});