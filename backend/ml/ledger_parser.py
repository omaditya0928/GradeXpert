import fitz  
import re
import pandas as pd
import logging

logging.basicConfig(filename='ledger_debug.log', level=logging.INFO, format='%(asctime)s - %(message)s')

def extract_text_horizontal(pdf_path):
    
    full_text = ""
    with fitz.open(pdf_path) as doc:
        for page in doc:
            words = page.get_text("words")
            
            lines_dict = {}
            for w in words:
                x0, y0, x1, y1, text, block_no, line_no, word_no = w
                
                y_key = round(y1, 0)
                lines_dict.setdefault(y_key, []).append((x0, text))
            
            for y_key in sorted(lines_dict.keys()):
                
                line_words = sorted(lines_dict[y_key], key=lambda x: x[0])
                line_text = " ".join([word[1] for word in line_words])
                full_text += line_text + "\n"
    return full_text

def parse_sppu_ledger(pdf_path):
    
    students = []
    
    full_text = extract_text_horizontal(pdf_path)
            
    lines = full_text.split('\n')
    
    current_student = None
    current_branch = "Unknown"
    
    for i, line in enumerate(lines):
        line = line.strip()
        
        if "PROGRAM :" in line.upper() or "PROGRAM:" in line.upper():
            branch_match = re.search(r"PROGRAM\s*:\s*(.+)", line, re.IGNORECASE)
            if branch_match:
                raw_branch = branch_match.group(1).strip()
                
                import re as regex
                current_branch = regex.split('(?i)Date of Printing', raw_branch)[0].strip()
                continue
        elif "SUB :" in line.upper() or "SUB:" in line.upper():
            branch_match = re.search(r"SUB\s*[:]\s*(.+)", line, re.IGNORECASE)
            if branch_match:
                current_branch = branch_match.group(1).strip()
                
        seat_match = re.search(r"SEAT NO\s*:\s*([A-Z0-9]+)", line, re.IGNORECASE)
        if seat_match:
            
            if current_student:
                students.append(current_student)
            
            current_student = {
                "seat_no": seat_match.group(1),
                "name": "",
                "mother_name": "",
                "branch": current_branch, 
                "prn": "",
                "subjects": {},
                "subjects_list": [],
                "sgpa": 0.0,
                "status": "Fail" 
            }
            
            name_match = re.search(r"Name\s*:\s*(.+?)(?=\s+Mother\s*:|\s+PRN\s*:|$)", line, re.IGNORECASE)
            if name_match:
                current_student["name"] = name_match.group(1).strip()
                
            mother_match = re.search(r"Mother\s*:\s*(.+?)(?=\s+PRN\s*:|$)", line, re.IGNORECASE)
            if mother_match:
                current_student["mother_name"] = mother_match.group(1).strip()
                
            prn_match = re.search(r"PRN\s*:\s*([A-Z0-9]+)", line, re.IGNORECASE)
            if prn_match:
                current_student["prn"] = prn_match.group(1)
                
            continue
            
        if current_student:
            
            if "Name:" in line or "Name :" in line:
                name_match = re.search(r"(?:Student )?Name\s*:\s*(.+?)(?=\s+(?:Mother(?: Name)?|Perm|PRN)|$)", line, re.IGNORECASE)
                if name_match and not current_student["name"]:
                    current_student["name"] = name_match.group(1).strip()
                
                mother_match = re.search(r"Mother(?: Name)?\s*:\s*(.+?)(?=\s+(?:Perm|PRN)|$)", line, re.IGNORECASE)
                if mother_match and not current_student["mother_name"]:
                    current_student["mother_name"] = mother_match.group(1).strip()
                    
            if "PRN" in line or "Perm Reg No" in line:
                prn_match = re.search(r"(?:Perm Reg No\(PRN\)|PRN)\s*:\s*([A-Z0-9]+)", line, re.IGNORECASE)
                if prn_match and not current_student["prn"]:
                    current_student["prn"] = prn_match.group(1)
                
            sgpa_match = re.search(r"SGPA\s*:\s*([\d\.]+)", line, re.IGNORECASE)
            if sgpa_match:
                current_student["sgpa"] = float(sgpa_match.group(1))
                current_student["status"] = "Pass" 
                
            if "FAIL" in line.upper() or "FAILS" in line.upper():
                current_student["status"] = "Fail"
                
            subject_match = re.search(r'^[\*\s]*([0-9]{3,}[A-Z0-9_\(\)\-]*)\s*(.+)', line)
            
            if subject_match:
                code = subject_match.group(1)
                remaining_content = subject_match.group(2).strip()
                
                def find_grade_in_text(text):
                    allowed_grades = {'O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'Ab', 'PP', 'NP', 'AP', 'AC', 'XX'}
                    parts = text.split()
                    grade = None
                    for p in reversed(parts):
                        if p in allowed_grades:
                            grade = p
                            break
                    return grade, parts

                found_grade, parts = find_grade_in_text(remaining_content)
                
                if not found_grade and i + 1 < len(lines):
                    next_line = lines[i+1].strip()
                    
                    if not re.search(r"SEAT NO|Name:|^[\*\s]*[0-9]{3,}", next_line, re.IGNORECASE):
                        combined_content = remaining_content + " " + next_line
                        found_grade, parts = find_grade_in_text(combined_content)

                if found_grade:
                    
                    grade_idx = len(parts) - 1 - list(reversed(parts)).index(found_grade)
                    total_marks = parts[grade_idx - 3] if grade_idx >= 3 else ""
                    
                    display_value = f"{total_marks} ({found_grade})" if (total_marks and not total_marks.isdigit() and '/' in total_marks) or (total_marks and 'AB' in total_marks.upper()) else found_grade
                    
                    mark_start = re.search(r'\s+(\d+/\d+|[A-Za-z]+/\d+|---|AB|Ab|FF|\b\d+\b)\s+', " " + remaining_content)
                    if mark_start:
                        name_core = remaining_content[:mark_start.start()].strip()
                    else:
                        name_parts = []
                        for p in parts:
                            if p == found_grade: break
                            name_parts.append(p)
                        while name_parts and (name_parts[-1].isdigit() or re.match(r'^\d+/\d+$', name_parts[-1])):
                            name_parts.pop()
                        name_core = " ".join(name_parts)
                    
                    name_prefix = ""
                    name_suffix = ""
                    
                    if i > 0:
                        prev_line = lines[i-1].strip()
                        if prev_line and not re.match(r'^(?:SEAT|Name|PROGRAM|PRN|SUB|[0-9]{3,})', prev_line, re.IGNORECASE):
                            if prev_line.startswith('*') or not any(char.isdigit() for char in prev_line):
                                name_prefix = prev_line

                    if i + 1 < len(lines):
                        next_lyne = lines[i+1].strip()
                        if next_lyne and not re.match(r'^(?:SEAT|Name|PROGRAM|PRN|SUB|\*|[0-9]{3,})', next_lyne, re.IGNORECASE):
                            if not any(char.isdigit() for char in next_lyne): 
                                name_suffix = next_lyne
                                
                    full_name = f"{name_prefix} {name_core} {name_suffix}".strip()
                    if full_name.startswith('*'): full_name = full_name[1:].strip()
                    if full_name.startswith(code): full_name = full_name[len(code):].strip()
                    
                    full_name = re.sub(r'\s+', ' ', full_name)
                    clean_name = full_name.strip()
                    if not clean_name: clean_name = f"Subject {code}"
                    
                    components = []
                    for p in parts[:max(0, grade_idx - 3)]:
                        if '/' in p:
                            parts_frac = p.split('/')
                            if len(parts_frac) == 2 and parts_frac[1].isdigit():
                                components.append(p)
                    
                    tw_pr_str = ""
                    if len(components) >= 2:
                        tw_pr_str = f"TW: {components[-2]} | OR/PR: {components[-1]}"
                    elif len(components) == 1:
                        tw_pr_str = f"Comp: {components[0]}"

                    if current_student:
                        logging.info(f"DEBUG: Found Subject {code} - {clean_name} for {current_student.get('name')}")
                        
                        subject_key = f"{clean_name} ({code})"
                        
                        tw_count = 0
                        pr_count = 0
                        insem_count = 0
                        ese_count = 0
                        or_count = 0
                        cie_count = 0
                        
                        is_theory = False
                        try:
                            if '/' in total_marks and int(total_marks.split('/')[1]) == 100:
                                is_theory = True
                        except: pass
                        
                        if not is_theory:
                            for p in components:
                                try:
                                    denom = int(p.split('/')[1])
                                    if denom in [60, 70]:
                                        is_theory = True
                                        break
                                except: pass
                        
                        calc_total = 0

                        for p in components:
                            try:
                                parts_frac = p.split('/')
                                num_str = parts_frac[0]
                                denom = int(parts_frac[1])
                                
                                num = 0
                                if num_str.isdigit():
                                    num = int(num_str)
                                
                                comp_name = "COMP"
                                if is_theory:
                                    if denom == 60 or denom == 70: comp_name = 'ESE'
                                    elif denom == 30 or denom == 20: comp_name = 'INSEM'
                                    elif denom == 15: comp_name = 'CIE'
                                    elif denom == 5: comp_name = 'ATTD'
                                    else: comp_name = f'COMP_{denom}'
                                    
                                    calc_total += num
                                else:
                                    if denom >= 60: 
                                        comp_name = 'ESE' if ese_count == 0 else 'ESE2'
                                        ese_count += 1
                                    elif denom == 50: 
                                        comp_name = 'PR' if pr_count == 0 else 'CIE'
                                        pr_count += 1
                                    elif denom == 30 or denom == 15:
                                        comp_name = 'INSEM' if insem_count == 0 else 'INSEM2'
                                        insem_count += 1
                                    elif denom == 25:
                                        comp_name = 'TW' if tw_count == 0 else 'TW2'
                                        tw_count += 1
                                    elif denom == 20:
                                        comp_name = 'OR' if or_count == 0 else 'OR2'
                                        or_count += 1
                                    elif denom == 10 or denom == 5:
                                        comp_name = 'CIE' if cie_count == 0 else 'ATTD'
                                        cie_count += 1
                                    else:
                                        comp_name = f'COMP_{denom}'
                                
                                current_student["subjects"][f"{subject_key}_{comp_name}"] = p
                            except Exception as e:
                                logging.error(f"Error parsing component {p}: {e}")
                                pass
                        
                        current_student["subjects"][f"{subject_key}_TOTAL"] = total_marks
                        current_student["subjects"][f"{subject_key}_GRADE"] = found_grade

                        comp_strings = []
                        for comp_name, p in current_student["subjects"].items():
                            if subject_key in comp_name and not comp_name.endswith("_TOTAL") and not comp_name.endswith("_GRADE") and not comp_name.endswith("_ESE"):
                                clean_cname = comp_name.split("_")[-1]
                                comp_strings.append(f"{clean_cname}: {p}")
                        tw_pr_str = " | ".join(comp_strings) if comp_strings else tw_pr_str

                        current_student["subjects_list"].append({
                            "seat_no": current_student["seat_no"],
                            "subject_code": code,
                            "subject_name": clean_name,
                            "grade": found_grade,
                            "marks": total_marks,
                            "tw_pr": tw_pr_str,
                            "status": "Fail" if found_grade in ['F', 'FF'] else "Pass"
                        })

    if current_student:
        students.append(current_student)
        
    return students

def generate_excel_from_data(students, output_path):
    
    flattened_students = []
    
    for s in students:
        
        flat_s = s.copy()
        
        subjects_dict = flat_s.pop('subjects', {})
        flat_s.pop('subjects_list', None)
        
        for sub_name, grade in subjects_dict.items():
            flat_s[sub_name] = grade
            
        flattened_students.append(flat_s)
    
    main_df = pd.DataFrame(flattened_students)
    
    if 'branch' not in main_df.columns:
        main_df['branch'] = 'General'
        
    fixed_cols = ['seat_no', 'name', 'mother_name', 'branch', 'prn', 'sgpa', 'status']
    
    existing_fixed = [c for c in fixed_cols if c in main_df.columns]
    subject_cols = [c for c in main_df.columns if c not in fixed_cols]
    
    def component_sort_key(col_name):
        
        if '_' not in col_name: return (col_name, 99)
        base = parse_base = col_name.rsplit('_', 1)[0]
        suffix = col_name.rsplit('_', 1)[1]
        
        priority = {
            'ESE': 1, 'ESE2': 2, 'ATTD': 3, 'CIE': 4, 'INSEM': 5, 'INSEM2': 6, 
            'OR': 7, 'OR2': 8, 'TW': 9, 'TW2': 10, 'PR': 11, 'TOTAL': 12, 'GRADE': 13
        }
        return (base.lower(), priority.get(suffix, 99), suffix)

    subject_cols.sort(key=component_sort_key)
    
    final_cols = existing_fixed + subject_cols
    main_df = main_df.reindex(columns=final_cols)

    all_subjects = []
    for s in students:
        if 'subjects_list' in s:
            all_subjects.extend(s['subjects_list'])
    
    subjects_df = pd.DataFrame(all_subjects)

    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        
        overview_df = main_df[existing_fixed].copy()
        overview_df.to_excel(writer, sheet_name='Overview', index=False)
        
        main_df.to_excel(writer, sheet_name='All Students', index=False)
        
        if not subjects_df.empty:
            subjects_df.to_excel(writer, sheet_name='Subjectwise', index=False)
        
        branches = main_df['branch'].unique()
        for branch in branches:
            
            branch_df = main_df[main_df['branch'] == branch].copy()
            
            valid_cols = existing_fixed.copy()
            for col in subject_cols:
                
                if not branch_df[col].isna().all():
                    valid_cols.append(col)
                
            logging.info(f"Branch: {branch} - Valid Columns: {len(valid_cols)}")
            
            branch_df = branch_df[valid_cols]
            
            clean_branch = str(branch).replace("/", "-")
            for char in ['\\', '?', '*', '[', ']', ':']:
                clean_branch = clean_branch.replace(char, '')
            sheet_name = clean_branch[:31]
            branch_df.to_excel(writer, sheet_name=sheet_name, index=False)
            
    return main_df 
