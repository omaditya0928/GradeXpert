# GradeXpert: Student Performance Analysis & SPPU Ledger Parser Platform

An enterprise-grade, microservice-based web application for automated Pune University (SPPU) Ledger PDF parsing, department-wise academic metrics evaluation, and student rank analysis developed for the Pune Institute of Computer Technology (PICT) faculty.

---

## Executive Summary
GradeXpert empowers college administrators, HODs, and faculty members with real-time academic analysis of student batches. By uploading standard university ledger PDFs, the platform dynamically parses thousands of lines of code, extracts individual component marks (Insem, ESE, Term Work, Oral/Practical), and aggregates statistical metrics (total processed, passed count, failed count, pass percentage, toppers lists) without manual data entry.

---

## System Architecture

The application is structured into decoupled microservices:

```
                  +-----------------------------------+
                  |          React Frontend           |
                  |     (Executive Dashboard)         |
                  +-----------------+-----------------+
                                    |
                                    | HTTP / JSON (Port 3000)
                                    v
                  +-----------------+-----------------+
                  |       Node.js Express Gateway     |
                  +--------+-----------------+--------+
                           |                 |
          Logs records     |                 | Proxy parse request (Port 5001)
          & auth metrics   v                 v
                  +--------+--------+  +-----+-----------------+
                  |  MySQL Database |  |  Python Flask Parser  |
                  | (Relational Store) |  |  (PyMuPDF & Pandas)   |
                  +-----------------+  +-----------------------+
                                                 (Port 5002)
```

### Component Breakdown
* **Executive Dashboard (frontend/)**: Single Page Application (SPA) built using Vite and React, styled with a premium slate-blue CSS grid system.
* **API Gateway Proxy (backend/)**: Node Express server executing route handling, JWT role management (Admin, HOD, Faculty), database persistence, and file management.
* **Relational Persistence Store (MySQL)**: Organizes normalized tables for branch departments, subjects, students, component grades, and history logs.
* **Analytical Python Service (ml/)**: Python Flask engine utilizing `PyMuPDF` (fitz) layout-preserving text extraction and `pandas` dataframes to parse PDF inputs and compile structured Excel spreadsheets.

---

## Functional Specifications

### 1. Automated SPPU Ledger PDF Parsing
Faculty can drag and drop a standard SPPU student result ledger PDF. The Python service extracts text coordinates horizontally to bypass PDF alignment issues, parses subject codes/names, maps term components, and generates a structured Excel spreadsheet with branch sheets and subjectwise summaries.

### 2. Department & Branch Performance Analytics
HODs can monitor branch-level performance. The dashboard computes pass percentages, approximate average marks, and lists the toppers in each engineering discipline (Computer Engineering, IT, E&TC, AI&DS).

### 3. Student Rankings & Merit List
Displays a real-time list of top-performing students across the college sorted by SGPA, equipped with a fuzzy search system to filter students instantly by name or seat number.

### 4. Backlog Tracking & Audit Logs
Faculty can view a list of failed students to diagnose specific semester backlog stats. The upload history is maintained in the MySQL database, allowing professors to download generated Excel worksheets or clear outdated ledger batches cleanly.
