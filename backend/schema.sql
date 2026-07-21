CREATE DATABASE IF NOT EXISTS gradexpert_db;
USE gradexpert_db;

CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'admin', 'hod', 'faculty'
  branch_id INT NULL,
  name VARCHAR(150) NULL,
  registration_id VARCHAR(50) NULL,
  institute VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ledger_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INT NOT NULL,
  academic_year VARCHAR(20),
  semester VARCHAR(10),
  total_students INT DEFAULT 0,
  pass_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  branch_id INT NOT NULL,
  semester INT NOT NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY unique_subject (name, branch_id, semester)
);

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seat_no VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  branch_id INT NULL,
  academic_year VARCHAR(20),
  upload_id INT NULL,
  sgpa FLOAT NULL,
  status VARCHAR(20) NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (upload_id) REFERENCES ledger_uploads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  marks_obtained FLOAT NOT NULL,
  max_marks FLOAT DEFAULT 100.0,
  grade VARCHAR(5),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE KEY unique_marks (student_id, subject_id)
);

-- Seed default branches
INSERT IGNORE INTO branches (id, name) VALUES (1, 'Computer Engineering');
INSERT IGNORE INTO branches (id, name) VALUES (2, 'Information Technology');
INSERT IGNORE INTO branches (id, name) VALUES (3, 'Electronics and Telecommunication');
INSERT IGNORE INTO branches (id, name) VALUES (4, 'Artificial Intelligence and Data Science');
