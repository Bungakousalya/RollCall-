# # deepface_service/deepface_service.py
# from flask import Flask, request, jsonify
# from deepface import DeepFace
# import os
# import cv2
# import numpy as np

# app = Flask(__name__)

# STUDENT_IMAGES_DIR = "uploads/student-photos"
# TEMP_UPLOAD_DIR = "temp_uploads"

# # Ensure directories exist on startup
# if not os.path.exists(STUDENT_IMAGES_DIR):
#     os.makedirs(STUDENT_IMAGES_DIR)
# if not os.path.exists(TEMP_UPLOAD_DIR):
#     os.makedirs(TEMP_UPLOAD_DIR)


# def preprocess_(img_path):
#     img = cv2.imread(img_path)

#     # 1. Resize large images (keep width ~1500px for speed)
#     h, w = img.shape[:2]
#     if w > 1600:
#         scale = 1600 / w
#         img = cv2.resize(img, (int(w * scale), int(h * scale)))

#     # 2. Brightness/contrast enhancement (for low light)
#     img = cv2.convertScaleAbs(img, alpha=1.3, beta=30)

#     # 3. Denoise (optional, helps if photo is grainy)
#     img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

#     enhanced_path = img_path.replace(".jpg", "_enhanced.jpg")
#     cv2.imwrite(enhanced_path, img)
#     return enhanced_path


# @app.route("/recognize", methods=["POST"])
# def recognize():
#     if 'classPhoto' not in request.files or request.files['classPhoto'].filename == '':
#         return jsonify({"error": "No class photo uploaded"}), 400

#     class_photo = request.files['classPhoto']
#     temp_photo_path = os.path.join(TEMP_UPLOAD_DIR, class_photo.filename)
#     class_photo.save(temp_photo_path)

#     # Preprocess before recognition
#     enhanced_path = preprocess_image(temp_photo_path)

#     present_students = set()
#     unrecognized_faces_count = 0

#     try:
#         # Detect and recognize faces
#         dfs = DeepFace.find(
#             img_path=enhanced_path,
#             db_path=STUDENT_IMAGES_DIR,
#             model_name='ArcFace',           # Robust recognition
#             detector_backend='retinaface',  # Multi-face detection
#             enforce_detection=True,
#             silent=True,
#             align=True  # Align tilted faces
#         )

#         # dfs is a list (one per detected face)
#         for df in dfs:
#             if not df.empty:
#                 best_match = df.iloc[0]
#                 distance = best_match['distance']

#                 # ✅ Only accept if distance is good enough
#                 if distance < 0.35:  # tune threshold
#                     identity_path = best_match['identity']
#                     student_id = os.path.splitext(os.path.basename(identity_path))[0]
#                     present_students.add(student_id)
#                 else:
#                     unrecognized_faces_count += 1
#             else:
#                 unrecognized_faces_count += 1

#     except Exception as e:
#         os.remove(temp_photo_path)
#         if os.path.exists(enhanced_path):
#             os.remove(enhanced_path)
#         return jsonify({"error": f"Face recognition failed: {str(e)}"}), 500

#     # Clean up
#     os.remove(temp_photo_path)
#     if os.path.exists(enhanced_path):
#         os.remove(enhanced_path)

#     return jsonify({
#         "presentStudents": list(present_students),
#         "unrecognizedFacesCount": unrecognized_faces_count
#     })


# if __name__ == "__main__":
#     app.run(host="0.0.0.0", port=5001, debug=True)









# deepface_service/deepface_service.py
from flask import Flask, request, jsonify
from deepface import DeepFace
import os
import cv2
import numpy as np
from numpy.linalg import norm

app = Flask(__name__)

STUDENT_IMAGES_DIR = "uploads/student-photos"
TEMP_UPLOAD_DIR = "temp_uploads"

# Ensure directories exist
os.makedirs(STUDENT_IMAGES_DIR, exist_ok=True)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# ========================
# Utility: Cosine similarity
# ========================
def cosine_similarity(vec1, vec2):
    return np.dot(vec1, vec2) / (norm(vec1) * norm(vec2))

# ========================
# Preprocess image
# ========================
def preprocess_image(img_path):
    img = cv2.imread(img_path)

    if img is None:
        return img_path  # fallback

    # 1. Resize if too large
    h, w = img.shape[:2]
    if w > 1600:
        scale = 1600 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    # 2. Brightness/contrast enhancement
    img = cv2.convertScaleAbs(img, alpha=1.3, beta=30)

    # 3. Denoise
    img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

    enhanced_path = img_path.replace(".jpg", "_enhanced.jpg")
    cv2.imwrite(enhanced_path, img)
    return enhanced_path

# ========================
# Load student embeddings once
# ========================
student_embeddings = {}

def load_student_embeddings():
    global student_embeddings
    student_embeddings = {}
    for filename in os.listdir(STUDENT_IMAGES_DIR):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            student_id = os.path.splitext(filename)[0]
            img_path = os.path.join(STUDENT_IMAGES_DIR, filename)
            try:
                embedding = DeepFace.represent(
                    img_path=img_path,
                    model_name="ArcFace",
                    detector_backend="retinaface",
                    enforce_detection=True
                )[0]["embedding"]
                student_embeddings[student_id] = embedding
                print(f"✅ Loaded embedding for {student_id}")
            except Exception as e:
                print(f"⚠️ Could not process {filename}: {e}")

load_student_embeddings()

# ========================
# API Endpoint
# ========================
@app.route("/recognize", methods=["POST"])
def recognize():
    if 'classPhoto' not in request.files or request.files['classPhoto'].filename == '':
        return jsonify({"error": "No class photo uploaded"}), 400

    class_photo = request.files['classPhoto']
    temp_photo_path = os.path.join(TEMP_UPLOAD_DIR, class_photo.filename)
    class_photo.save(temp_photo_path)

    enhanced_path = preprocess_image(temp_photo_path)

    present_students = set()
    unrecognized_faces_count = 0

    try:
        # Extract embeddings for all detected faces
        detections = DeepFace.represent(
            img_path=enhanced_path,
            model_name="ArcFace",
            detector_backend="retinaface",
            enforce_detection=True
        )

        for det in detections:
            face_emb = det["embedding"]

            best_match = None
            best_score = -1

            # Compare with all registered students
            for student_id, student_emb in student_embeddings.items():
                sim = cosine_similarity(face_emb, student_emb)
                if sim > best_score:
                    best_score = sim
                    best_match = student_id

            # Apply threshold
            if best_score >= 0.45:  # 👈 tune this (0.45–0.6 works well for class photos)
                present_students.add(best_match)
            else:
                unrecognized_faces_count += 1

    except Exception as e:
        return jsonify({"error": f"Face recognition failed: {str(e)}"}), 500
    finally:
        # Clean up
        if os.path.exists(temp_photo_path):
            os.remove(temp_photo_path)
        if os.path.exists(enhanced_path):
            os.remove(enhanced_path)

    return jsonify({
        "presentStudents": list(present_students),
        "unrecognizedFacesCount": unrecognized_faces_count,
        "totalDetectedFaces": len(detections) if 'detections' in locals() else 0
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
