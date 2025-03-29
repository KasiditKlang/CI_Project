require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const cors = require('cors');
const mammoth = require('mammoth');

const app = express();
const port = 3000;

// ตั้งค่าการอัปโหลดไฟล์
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('ประเภทไฟล์ไม่รองรับ'));
  }
}).single('file');

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());
app.use(cors({ origin: '*' })); // Allow all origins (use cautiously in production)

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

app.post('/chat', async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ 
        error: "ข้อผิดพลาดในการอัปโหลดไฟล์",
        details: err.message 
      });
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro-002",
        apiVersion: "v1"
      });

      let prompt = req.body.message || '';
      let parts = [];

      // เพิ่มข้อความเสมอ (จำเป็นสำหรับ API)
      if (prompt) {
        parts.push({ text: prompt });
      } else {
        // ถ้าไม่มีข้อความ ให้ใช้ข้อความเริ่มต้น
        parts.push({ text: "กรุณาวิเคราะห์เนื้อหาต่อไปนี้" });
      }

      // ประมวลผลไฟล์ที่อัปโหลด
      if (req.file) {
        const filePath = req.file.path;
        const fileType = req.file.mimetype;

        if (fileType.startsWith('image/')) {
          parts.push({
            inlineData: {
              data: fs.readFileSync(filePath).toString('base64'),
              mimeType: fileType
            }
          });
        }
        else if (fileType === 'application/pdf') {
          const dataBuffer = fs.readFileSync(filePath);
          const pdfData = await pdf(dataBuffer);
          parts.push({ text: `เนื้อหา PDF:\n${pdfData.text}` });
        }
        else if (fileType.includes('wordprocessingml.document')) {
          const result = await mammoth.extractRawText({ path: filePath });
          parts.push({ text: `เนื้อหาเอกสาร:\n${result.value}` });
        }
        else if (fileType === 'text/plain') {
          const textContent = fs.readFileSync(filePath, 'utf8');
          parts.push({ text: `เนื้อหาไฟล์:\n${textContent}` });
        }

        fs.unlinkSync(filePath);
      }

      const result = await model.generateContent({
        contents: [{ 
          role: "user",
          parts: parts
        }]
      });

      const response = await result.response;
      const text = response.text();

      res.json({ response: text });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ 
        error: "ข้อผิดพลาดในการประมวลผล",
        details: error.message 
      });
    }
  });
});

// สร้างโฟลเดอร์ uploads
const uploadDir = path.join(__dirname, '../client/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.listen(port, () => {
  console.log(`เซิร์ฟเวอร์ทำงานที่ http://localhost:${port}`);
});
