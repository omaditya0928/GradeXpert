from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
from ledger_parser import parse_sppu_ledger, generate_excel_from_data

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(BASE_DIR))
UPLOADS_DIR = os.path.join(ROOT_DIR, 'uploads')
GENERATED_DIR = os.path.join(ROOT_DIR, 'generated')

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "python-parser"})

@app.route('/parse', methods=['POST'])
def parse_ledger():
    if 'ledger' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['ledger']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    upload_id = request.form.get('upload_id')
    if not upload_id:
        return jsonify({"error": "Missing upload_id"}), 400

    try:
        temp_pdf_path = os.path.join(UPLOADS_DIR, file.filename)
        file.save(temp_pdf_path)
        
        students = parse_sppu_ledger(temp_pdf_path)
        
        excel_filename = f"report_{upload_id}.xlsx"
        excel_path = os.path.join(GENERATED_DIR, excel_filename)
        generate_excel_from_data(students, excel_path)
        
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)

        return jsonify({
            "success": True,
            "upload_id": upload_id,
            "students": students
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)
