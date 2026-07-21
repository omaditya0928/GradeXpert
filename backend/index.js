import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
const generatedDir = path.join(__dirname, '..', 'generated');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gradexpert_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function seedAdmin() {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE role = "admin"');
    if (rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, role, name, registration_id, institute) VALUES (?, ?, ?, ?, ?, ?)',
        ['admin', passwordHash, 'admin', 'Administrator', 'ADMIN001', 'PICT']
      );
      console.log('Default Admin user initialized: admin / admin123');
    }
  } catch (error) {
    console.error('Error seeding admin user:', error);
  }
}
seedAdmin();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, process.env.JWT_SECRET || 'new-secret-key-2026-v2', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

app.post('/api/auth/register', async (req, res) => {
  const { name, registration_id, institute, department, password } = req.body;
  if (!name || !registration_id || !department || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    
    const [existing] = await pool.query('SELECT * FROM users WHERE username = ?', [registration_id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User with this Registration ID already exists' });
    }

    let branchId = null;
    const [branches] = await pool.query('SELECT id FROM branches WHERE name = ?', [department]);
    if (branches.length > 0) {
      branchId = branches[0].id;
    } else {
      const [insertBranch] = await pool.query('INSERT INTO branches (name) VALUES (?)', [department]);
      branchId = insertBranch.insertId;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role, branch_id, name, registration_id, institute) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [registration_id, hashedPassword, 'faculty', branchId, name, registration_id, institute]
    );

    res.status(201).json({ message: 'Successfully registered!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id },
      process.env.JWT_SECRET || 'new-secret-key-2026-v2',
      { expiresIn: '24h' }
    );

    res.json({
      access_token: token,
      role: user.role,
      name: user.name || 'User'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    let branchName = 'All Branches';
    if (user.branch_id) {
      const [branches] = await pool.query('SELECT name FROM branches WHERE id = ?', [user.branch_id]);
      if (branches.length > 0) branchName = branches[0].name;
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role.toUpperCase(),
      branch: branchName,
      created_at: new Date(user.created_at).toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', authenticateToken, upload.single('ledger'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [uploadInsert] = await connection.query(
      'INSERT INTO ledger_uploads (filename, uploaded_by, academic_year, semester) VALUES (?, ?, ?, ?)',
      [req.file.originalname, req.user.id, '2023-2024', '2']
    );
    const uploadId = uploadInsert.insertId;

    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5002';
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(req.file.path)], { type: req.file.mimetype });
    formData.append('ledger', blob, req.file.originalname);
    formData.append('upload_id', uploadId.toString());

    const pyResponse = await fetch(`${pythonUrl}/parse`, {
      method: 'POST',
      body: formData
    });

    if (!pyResponse.ok) {
      const errorText = await pyResponse.text();
      throw new Error(`Python parser failed: ${errorText}`);
    }

    const pyData = await pyResponse.json();
    const studentsList = pyData.students || [];

    let passCount = 0;
    let failCount = 0;

    const branchCache = {};
    const subjectCache = {};

    for (const studentData of studentsList) {
      const branchName = studentData.branch || 'Unknown';
      let branchId = null;

      if (branchCache[branchName]) {
        branchId = branchCache[branchName];
      } else {
        const [branches] = await connection.query('SELECT id FROM branches WHERE name = ?', [branchName]);
        if (branches.length > 0) {
          branchId = branches[0].id;
        } else {
          const [insBranch] = await connection.query('INSERT INTO branches (name) VALUES (?)', [branchName]);
          branchId = insBranch.insertId;
        }
        branchCache[branchName] = branchId;
      }

      const seatNo = studentData.seat_no;
      const studentName = studentData.name || '';
      const sgpa = studentData.sgpa || 0.0;
      const status = studentData.status || 'Fail';

      if (status === 'Pass') passCount++;
      else failCount++;

      const [studentResult] = await connection.query(
        `INSERT INTO students (seat_no, name, branch_id, academic_year, upload_id, sgpa, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
           name = VALUES(name), 
           branch_id = VALUES(branch_id), 
           academic_year = VALUES(academic_year), 
           upload_id = VALUES(upload_id),
           sgpa = VALUES(sgpa),
           status = VALUES(status)`,
        [seatNo, studentName, branchId, '2023-2024', uploadId, sgpa, status]
      );

      let studentId = null;
      if (studentResult.insertId) {
        studentId = studentResult.insertId;
      } else {
        const [studentRows] = await connection.query('SELECT id FROM students WHERE seat_no = ?', [seatNo]);
        studentId = studentRows[0].id;
      }

      const subjectsList = studentData.subjects_list || [];
      for (const sub of subjectsList) {
        const subCode = sub.subject_code;
        const subName = sub.subject_name;
        const subGrade = sub.grade || '';
        const marksStr = sub.marks ? sub.marks.toString() : '';

        const subjectKey = `${subName}_${branchId}_2`;
        let subjectId = null;

        if (subjectCache[subjectKey]) {
          subjectId = subjectCache[subjectKey];
        } else {
          const [subjRows] = await connection.query(
            'SELECT id FROM subjects WHERE name = ? AND branch_id = ? AND semester = ?',
            [subName, branchId, 2]
          );
          if (subjRows.length > 0) {
            subjectId = subjRows[0].id;
          } else {
            const [insSubj] = await connection.query(
              'INSERT INTO subjects (name, branch_id, semester) VALUES (?, ?, ?)',
              [subName, branchId, 2]
            );
            subjectId = insSubj.insertId;
          }
          subjectCache[subjectKey] = subjectId;
        }

        let marksObtained = 0.0;
        let maxMarks = 100.0;
        let finalGrade = subGrade;

        if (marksStr) {
          const match = marksStr.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            marksObtained = parseFloat(match[1]);
            maxMarks = parseFloat(match[2]);
          } else if (/^\d+$/.test(marksStr)) {
            marksObtained = parseFloat(marksStr);
          } else {
            finalGrade = 'F';
          }
        }

        if (!finalGrade || ['AB', 'ABSENT', 'FF', 'F'].includes(finalGrade.toUpperCase())) {
          finalGrade = 'F';
        }

        await connection.query(
          `INSERT INTO marks (student_id, subject_id, marks_obtained, max_marks, grade) 
           VALUES (?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE 
             marks_obtained = VALUES(marks_obtained), 
             max_marks = VALUES(max_marks), 
             grade = VALUES(grade)`,
          [studentId, subjectId, marksObtained, maxMarks, finalGrade]
        );
      }
    }

    await connection.query(
      'UPDATE ledger_uploads SET total_students = ?, pass_count = ?, fail_count = ? WHERE id = ?',
      [studentsList.length, passCount, failCount, uploadId]
    );

    await connection.commit();

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.json({
      message: 'File processing completed successfully!',
      upload_id: uploadId,
      students_processed: studentsList.length
    });

  } catch (error) {
    await connection.rollback();
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Upload processing error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM ledger_uploads ORDER BY upload_date DESC';
    let params = [];

    if (req.user.role !== 'admin') {
      query = 'SELECT * FROM ledger_uploads WHERE uploaded_by = ? ORDER BY upload_date DESC';
      params = [req.user.id];
    }

    const [uploads] = await pool.query(query, params);
    
    const results = uploads.map(u => {
      const passPerc = u.total_students > 0 ? parseFloat(((u.pass_count / u.total_students) * 100).toFixed(1)) : 0;
      return {
        id: u.id,
        filename: u.filename,
        upload_date: new Date(u.upload_date).toISOString().replace('T', ' ').substring(0, 16),
        academic_year: u.academic_year,
        semester: u.semester,
        total_students: u.total_students,
        pass_percentage: passPerc,
        pass_count: u.pass_count,
        fail_count: u.fail_count
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history/:id', authenticateToken, async (req, res) => {
  const uploadId = req.params.id;
  try {
    
    await pool.query('DELETE FROM students WHERE upload_id = ?', [uploadId]);
    await pool.query('DELETE FROM ledger_uploads WHERE id = ?', [uploadId]);

    const excelPath = path.join(generatedDir, `report_${uploadId}.xlsx`);
    if (fs.existsSync(excelPath)) {
      fs.unlinkSync(excelPath);
    }

    res.json({ message: 'Successfully deleted upload history record.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getActiveUploadId(userId, requestedUploadId) {
  if (requestedUploadId && requestedUploadId !== 'undefined' && requestedUploadId !== 'null') {
    return requestedUploadId;
  }
  const [rows] = await pool.query(
    'SELECT id FROM ledger_uploads WHERE uploaded_by = ? ORDER BY upload_date DESC LIMIT 1',
    [userId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const uploadId = await getActiveUploadId(req.user.id, req.query.upload_id);
    if (!uploadId) {
      return res.json({
        totalStudents: 0,
        passPercentage: 0,
        passedStudents: 0,
        failedStudents: 0,
        atktCount: 0,
        collegeTopper: null
      });
    }

    const [uploads] = await pool.query('SELECT * FROM ledger_uploads WHERE id = ?', [uploadId]);
    if (uploads.length === 0) return res.status(404).json({ error: 'Record not found' });
    const u = uploads[0];

    const passPerc = u.total_students > 0 ? parseFloat(((u.pass_count / u.total_students) * 100).toFixed(2)) : 0.0;

    const [topperRows] = await pool.query(
      `SELECT s.name, s.sgpa, b.name as branch 
       FROM students s 
       LEFT JOIN branches b ON s.branch_id = b.id 
       WHERE s.upload_id = ? AND s.sgpa IS NOT NULL 
       ORDER BY s.sgpa DESC LIMIT 1`,
      [uploadId]
    );

    const topper = topperRows.length > 0 ? {
      name: topperRows[0].name,
      branch: topperRows[0].branch || 'Unknown',
      percentage: topperRows[0].sgpa
    } : null;

    res.json({
      totalStudents: u.total_students,
      passedStudents: u.pass_count,
      failedStudents: u.fail_count,
      passPercentage: passPerc,
      atktCount: 0,
      collegeTopper: topper
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analysis/branch', authenticateToken, async (req, res) => {
  try {
    const uploadId = await getActiveUploadId(req.user.id, req.query.upload_id);
    if (!uploadId) return res.json([]);

    const [branchStats] = await pool.query(
      `SELECT 
        b.name, 
        COUNT(s.id) as total_students,
        SUM(CASE WHEN s.status = 'Pass' THEN 1 ELSE 0 END) as passed_students,
        AVG(s.sgpa) as avg_sgpa
       FROM students s
       JOIN branches b ON s.branch_id = b.id
       WHERE s.upload_id = ?
       GROUP BY b.id`,
      [uploadId]
    );

    const results = [];
    for (const b of branchStats) {
      
      const [topperRows] = await pool.query(
        `SELECT name FROM students 
         WHERE upload_id = ? AND branch_id = (SELECT id FROM branches WHERE name = ?) AND sgpa IS NOT NULL 
         ORDER BY sgpa DESC LIMIT 1`,
        [uploadId, b.name]
      );
      
      const topperName = topperRows.length > 0 ? topperRows[0].name : 'N/A';
      const passed = Number(b.passed_students);
      const total = Number(b.total_students);
      const passPerc = total > 0 ? parseFloat(((passed / total) * 100).toFixed(1)) : 0;
      
      results.push({
        name: b.name,
        passPercentage: passPerc,
        avgMarks: parseFloat(((b.avg_sgpa || 0) * 10).toFixed(1)), 
        topper: topperName
      });
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analysis/failed', authenticateToken, async (req, res) => {
  try {
    const uploadId = await getActiveUploadId(req.user.id, req.query.upload_id);
    if (!uploadId) return res.json([]);

    const [rows] = await pool.query(
      `SELECT s.seat_no, s.name, b.name as branch, s.sgpa, s.status 
       FROM students s
       LEFT JOIN branches b ON s.branch_id = b.id
       WHERE s.upload_id = ? AND s.status = 'Fail'`,
      [uploadId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analysis/merit', authenticateToken, async (req, res) => {
  try {
    const uploadId = await getActiveUploadId(req.user.id, req.query.upload_id);
    if (!uploadId) return res.json([]);

    const [rows] = await pool.query(
      `SELECT s.seat_no, s.name, b.name as branch, s.sgpa, s.status 
       FROM students s
       LEFT JOIN branches b ON s.branch_id = b.id
       WHERE s.upload_id = ?
       ORDER BY s.sgpa DESC LIMIT 50`,
      [uploadId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/report/:id', (req, res) => {
  const uploadId = req.params.id;
  const filePath = path.join(generatedDir, `report_${uploadId}.xlsx`);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, `Student_Result_Report_${uploadId}.xlsx`);
  } else {
    res.status(404).json({ error: 'Report file not found. Ensure file parsing was processed correctly.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'node-api' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node Express gateway server active on port ${PORT}`);
});
