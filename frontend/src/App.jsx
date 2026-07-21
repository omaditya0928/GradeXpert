import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5001/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [institute, setInstitute] = useState('PICT');
  const [department, setDepartment] = useState('Computer Engineering');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploads, setUploads] = useState([]);
  const [activeUploadId, setActiveUploadId] = useState('');
  const [stats, setStats] = useState({
    totalStudents: 0,
    passedStudents: 0,
    failedStudents: 0,
    passPercentage: 0,
    collegeTopper: null
  });
  const [branchAnalysis, setBranchAnalysis] = useState([]);
  const [meritList, setMeritList] = useState([]);
  const [failedStudents, setFailedStudents] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchMe();
      fetchHistory();
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDashboardData(activeUploadId);
    }
  }, [token, activeUploadId]);

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        handleLogout();
      }
    } catch (e) {
      setErrorMessage('Failed to fetch user context');
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUploads(data);
        if (data.length > 0 && !activeUploadId) {
          setActiveUploadId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDashboardData = async (uploadId) => {
    const queryParam = uploadId ? `?upload_id=${uploadId}` : '';
    try {
      
      const resStats = await fetch(`${API_BASE}/dashboard/stats${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resStats.ok) {
        const data = await resStats.json();
        setStats(data);
      }

      const resBranch = await fetch(`${API_BASE}/analysis/branch${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resBranch.ok) {
        const data = await resBranch.json();
        setBranchAnalysis(data);
      }

      const resMerit = await fetch(`${API_BASE}/analysis/merit${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resMerit.ok) {
        const data = await resMerit.json();
        setMeritList(data);
      }

      const resFailed = await fetch(`${API_BASE}/analysis/failed${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resFailed.ok) {
        const data = await resFailed.json();
        setFailedStudents(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.access_token);
        setSuccessMessage('Logged in successfully!');
      } else {
        setErrorMessage(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setErrorMessage('Network connection error');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          registration_id: username,
          institute,
          department,
          password
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage('Registration successful! Please login.');
        setIsRegister(false);
      } else {
        setErrorMessage(data.error || 'Registration failed');
      }
    } catch (err) {
      setErrorMessage('Network connection error');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setUploads([]);
    setActiveUploadId('');
    setStats({
      totalStudents: 0,
      passedStudents: 0,
      failedStudents: 0,
      passPercentage: 0,
      collegeTopper: null
    });
    setBranchAnalysis([]);
    setMeritList([]);
    setFailedStudents([]);
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a file first.');
      return;
    }
    
    setIsUploading(true);
    setSuccessMessage('');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('ledger', selectedFile);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(data.message || 'File uploaded and parsed successfully!');
        setSelectedFile(null);
        fetchHistory();
      } else {
        setErrorMessage(data.error || 'File processing failed');
      }
    } catch (err) {
      setErrorMessage('Upload request timed out or connection refused');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteHistory = async (id) => {
    if (!confirm('Are you sure you want to delete this ledger upload? All student records associated with it will be cleared.')) return;
    try {
      const res = await fetch(`${API_BASE}/history/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMessage('Ledger deleted successfully');
        if (activeUploadId === id) {
          setActiveUploadId('');
        }
        fetchHistory();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Delete failed');
      }
    } catch (e) {
      setErrorMessage('Network error');
    }
  };

  const filteredMeritList = meritList.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.seat_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFailedList = failedStudents.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.seat_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="bg-decor decoration-blue-1"></div>
        <div className="bg-decor decoration-blue-2"></div>
        <div className="auth-container">
          <div className="auth-header">
            <h1>GradeXpert</h1>
            <p>PICT Result Analysis & SPPU Ledger Parsing Portal</p>
          </div>

          <form onSubmit={isRegister ? handleRegister : handleLogin} className="auth-form">
            <h2>{isRegister ? 'Create Faculty Account' : 'Sign In'}</h2>
            
            {successMessage && <div className="toast toast-success">{successMessage}</div>}
            {errorMessage && <div className="toast toast-error">{errorMessage}</div>}

            {isRegister && (
              <>
                <div className="form-group">
                  <label htmlFor="name">Full Name</label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="institute">Institute Name</label>
                  <input
                    id="institute"
                    type="text"
                    required
                    value={institute}
                    onChange={(e) => setInstitute(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="department">Department</label>
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="Computer Engineering">Computer Engineering</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics and Telecommunication">Electronics & Telecom</option>
                    <option value="Artificial Intelligence and Data Science">AI & Data Science</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="username">Registration ID (Username)</label>
              <input
                id="username"
                type="text"
                required
                placeholder="e.g. REG12345"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                placeholder="Enter secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary">
              {isRegister ? 'Register Account' : 'Sign In'}
            </button>

            <p className="auth-toggle">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button type="button" onClick={() => { setIsRegister(!isRegister); setErrorMessage(''); setSuccessMessage(''); }}>
                {isRegister ? 'Sign In' : 'Register Now'}
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="bg-decor decoration-blue-1"></div>
      <div className="bg-decor decoration-blue-2"></div>

      {}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span>GradeXpert</span>
        </div>

        {user && (
          <div className="user-profile">
            <div className="user-avatar">{user.name.charAt(0)}</div>
            <div className="user-info">
              <h3>{user.name}</h3>
              <p className="role-tag">{user.role}</p>
              <p className="branch-text">{user.branch}</p>
            </div>
          </div>
        )}

        <nav className="nav-menu">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>
            📤 Upload Ledger
          </button>
          <button className={activeTab === 'merit' ? 'active' : ''} onClick={() => setActiveTab('merit')}>
            🏆 Merit List
          </button>
          <button className={activeTab === 'failed' ? 'active' : ''} onClick={() => setActiveTab('failed')}>
            ❌ Failed Students
          </button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
            📂 History Logs
          </button>
        </nav>

        <button onClick={handleLogout} className="btn-logout">
          🚪 Sign Out
        </button>
      </aside>

      {}
      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <h1>Student Performance Dashboard</h1>
            <p>Pune Institute of Computer Technology (PICT)</p>
          </div>
          
          {uploads.length > 0 && (
            <div className="batch-selector">
              <label htmlFor="batch-select">Active Ledger Batch:</label>
              <select
                id="batch-select"
                value={activeUploadId}
                onChange={(e) => setActiveUploadId(e.target.value)}
              >
                {uploads.map(u => (
                  <option key={u.id} value={u.id}>{u.filename} ({u.upload_date})</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {successMessage && <div className="toast toast-success">{successMessage}</div>}
        {errorMessage && <div className="toast toast-error">{errorMessage}</div>}

        {}
        {activeTab === 'dashboard' && (
          <div className="tab-pane">
            <div className="stats-grid">
              <div className="stat-card border-blue">
                <h3>Total Processed</h3>
                <div className="stat-value">{stats.totalStudents}</div>
                <p>Students in active ledger</p>
              </div>
              <div className="stat-card border-green">
                <h3>Passed Students</h3>
                <div className="stat-value text-green">{stats.passedStudents}</div>
                <p>Successfully passed all terms</p>
              </div>
              <div className="stat-card border-red">
                <h3>Failed Students</h3>
                <div className="stat-value text-red">{stats.failedStudents}</div>
                <p>Students with active backlog (F)</p>
              </div>
              <div className="stat-card border-indigo">
                <h3>Pass Percentage</h3>
                <div className="stat-value text-indigo">{stats.passPercentage}%</div>
                <p>PICT Academic performance index</p>
              </div>
            </div>

            {stats.collegeTopper && (
              <div className="topper-hero">
                <div className="topper-badge">🥇 Academic Topper</div>
                <div className="topper-details">
                  <h2>{stats.collegeTopper.name}</h2>
                  <p>Branch: {stats.collegeTopper.branch}</p>
                  <div className="topper-marks">SGPA: {stats.collegeTopper.percentage}</div>
                </div>
              </div>
            )}

            <div className="panel">
              <h2>Department Performance Overview</h2>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Department Name</th>
                      <th>Pass Percentage</th>
                      <th>Approx. Avg Marks (SGPA x 10)</th>
                      <th>Department Topper</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchAnalysis.length > 0 ? (
                      branchAnalysis.map((b, idx) => (
                        <tr key={idx}>
                          <td><strong>{b.name}</strong></td>
                          <td>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${b.passPercentage}%` }}></div>
                              <span>{b.passPercentage}%</span>
                            </div>
                          </td>
                          <td>{b.avgMarks} / 100</td>
                          <td>🏆 {b.topper}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="text-center">No branch analysis metrics available. Upload a ledger PDF first.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'upload' && (
          <div className="tab-pane">
            <div className="panel upload-panel">
              <h2>Upload SPPU Ledger (PDF Format)</h2>
              <p>Upload Pune University student result ledger PDFs here. The backend Python parser will extract student seat numbers, names, subject components (Insem, ESE, Oral, TW), SGPA scores, and fail indicators dynamically.</p>

              <form onSubmit={handleFileUpload} className="upload-form">
                <div className="file-dropzone">
                  <input
                    type="file"
                    accept=".pdf"
                    id="ledger-file"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                  />
                  <label htmlFor="ledger-file">
                    {selectedFile ? (
                      <div className="file-info">
                        <span>📄</span>
                        <p>{selectedFile.name}</p>
                        <p className="file-size">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <div className="drop-prompt">
                        <span>📥</span>
                        <p>Drag and drop your SPPU Ledger PDF file here, or click to browse</p>
                      </div>
                    )}
                  </label>
                </div>

                <button type="submit" disabled={isUploading || !selectedFile} className="btn btn-primary btn-large">
                  {isUploading ? 'Parsing PDF Ledger & Saving Database...' : 'Upload & Parse Results'}
                </button>
              </form>

              {isUploading && (
                <div className="parsing-loader">
                  <div className="spinner"></div>
                  <p>Executing PyMuPDF and Pandas parser. This extracts thousands of subject marks arrays. Please wait...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {}
        {activeTab === 'merit' && (
          <div className="tab-pane">
            <div className="panel">
              <div className="panel-header">
                <h2>Merit List (Academic Rankings)</h2>
                <input
                  type="text"
                  placeholder="Search student by Name or Seat No..."
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Seat No</th>
                      <th>Student Name</th>
                      <th>Department</th>
                      <th>SGPA</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeritList.length > 0 ? (
                      filteredMeritList.map((s, idx) => (
                        <tr key={idx}>
                          <td><strong>#{idx + 1}</strong></td>
                          <td>{s.seat_no}</td>
                          <td><strong>{s.name}</strong></td>
                          <td>{s.branch}</td>
                          <td><span className="badge-sgpa">{s.sgpa}</span></td>
                          <td>
                            <span className={`badge-status ${s.status.toLowerCase() === 'pass' ? 'badge-pass' : 'badge-fail'}`}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center">No student merit records matches.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'failed' && (
          <div className="tab-pane">
            <div className="panel">
              <div className="panel-header">
                <h2>Failed Students (Backlog Logs)</h2>
                <input
                  type="text"
                  placeholder="Search student by Name or Seat No..."
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Seat No</th>
                      <th>Student Name</th>
                      <th>Department</th>
                      <th>SGPA</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFailedList.length > 0 ? (
                      filteredFailedList.map((s, idx) => (
                        <tr key={idx}>
                          <td>{s.seat_no}</td>
                          <td><strong>{s.name}</strong></td>
                          <td>{s.branch}</td>
                          <td><span className="badge-sgpa">{s.sgpa}</span></td>
                          <td><span className="badge-status badge-fail">{s.status}</span></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="text-center">No failed student records matches. All students passed!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {}
        {activeTab === 'history' && (
          <div className="tab-pane">
            <div className="panel">
              <h2>Ledger Upload Audit Telemetry</h2>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Uploaded Ledger Filename</th>
                      <th>Upload Date</th>
                      <th>Total Students</th>
                      <th>Pass Percentage</th>
                      <th>Pass / Fail Ratio</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.length > 0 ? (
                      uploads.map(u => (
                        <tr key={u.id}>
                          <td><strong>{u.filename}</strong></td>
                          <td>{u.upload_date}</td>
                          <td>{u.total_students}</td>
                          <td>{u.pass_percentage}%</td>
                          <td>
                            <span className="text-green">{u.pass_count} Passed</span> /{' '}
                            <span className="text-red">{u.fail_count} Failed</span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <a
                                href={`http://localhost:5001/api/download/report/${u.id}`}
                                className="btn btn-secondary btn-small"
                                target="_blank"
                                rel="noreferrer"
                              >
                                📥 Download Excel
                              </a>
                              <button
                                onClick={() => handleDeleteHistory(u.id)}
                                className="btn btn-danger btn-small"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center">No ledger files uploaded yet. Go to the Upload tab to add one.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
